--
-- PostgreSQL database dump
--

\restrict 3GMGEnYr0EJ7iotrkbzOzSmVcWDzikaKJ7fFKqv2n0IJBFuP3lRofzcBvBZd5fz

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: complete_admin_checkin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.complete_admin_checkin(p_reservation_id uuid) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  v_reservation record;
  v_guest_count integer;
BEGIN
  SELECT
    r.id,
    r.status,
    r.payment_status,
    r.payment_method,
    r.guests_count
  INTO v_reservation
  FROM public.reservations AS r
  WHERE r.id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '予約が見つかりません。'
    );
  END IF;

  IF v_reservation.status = 'checked_in' THEN
    RETURN jsonb_build_object(
      'success', true,
      'alreadyCheckedIn', true
    );
  END IF;

  IF v_reservation.status IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '宿泊承認されていない予約はチェックインできません。'
    );
  END IF;

  IF v_reservation.payment_method IS DISTINCT FROM 'onsite'
     AND v_reservation.payment_status IS DISTINCT FROM 'paid' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '事前決済の支払いが確認できていません。'
    );
  END IF;

  SELECT COUNT(*)::integer
  INTO v_guest_count
  FROM public.reservation_guests AS g
  WHERE g.reservation_id = p_reservation_id;

  IF v_guest_count = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '宿泊者情報が登録されていません。管理画面の「宿泊者情報」から必要項目を入力し、保存してください。'
    );
  END IF;

  IF v_guest_count <> GREATEST(
    1,
    LEAST(20, COALESCE(v_reservation.guests_count, 1))
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', '宿泊者情報の登録人数が予約人数と一致しません。管理者による確認が必要です。'
    );
  END IF;

  UPDATE public.reservations
  SET
    status = 'checked_in',
    payment_status = CASE
      WHEN v_reservation.payment_method = 'onsite' THEN 'paid'
      ELSE payment_status
    END
  WHERE id = p_reservation_id;

  RETURN jsonb_build_object(
    'success', true,
    'alreadyCheckedIn', false
  );
END;
$$;


--
-- Name: rotate_precheckin_token(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rotate_precheckin_token(p_reservation_id uuid, p_token_hash text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_reservation record;
BEGIN
  -- 入力値を検証
  IF p_reservation_id IS NULL
     OR p_token_hash IS NULL
     OR p_token_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid request';
  END IF;

  -- 予約行をロックし、事前登録との競合を防ぐ
  SELECT
    r.id,
    r.status,
    r.guest_email,
    r.guest_name,
    r.reservation_code,
    r.check_in_date,
    r.check_out_date,
    r.guests_count,
    r.arrival_time,
    r.total_amount,
    r.precheckin_token_expires_at,
    r.precheckin_token_used_at
  INTO v_reservation
  FROM public.reservations AS r
  WHERE r.id = p_reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found';
  END IF;

  IF v_reservation.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Reservation is not approved';
  END IF;

  IF v_reservation.guest_email IS NULL
     OR pg_catalog.btrim(v_reservation.guest_email) = ''
  THEN
    RAISE EXCEPTION 'Guest email is missing';
  END IF;

  IF v_reservation.precheckin_token_expires_at IS NULL
     OR v_reservation.precheckin_token_expires_at < pg_catalog.now()
  THEN
    RAISE EXCEPTION 'Registration link has expired';
  END IF;

  IF v_reservation.precheckin_token_used_at IS NOT NULL THEN
    RAISE EXCEPTION 'Registration is already completed';
  END IF;

  -- 新しいトークンに更新。登録期限は変更しない
  UPDATE public.reservations
  SET precheckin_token_hash = p_token_hash
  WHERE id = p_reservation_id;

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'id', v_reservation.id,
    'guest_email', v_reservation.guest_email,
    'guest_name', v_reservation.guest_name,
    'reservation_code', v_reservation.reservation_code,
    'check_in_date', v_reservation.check_in_date,
    'check_out_date', v_reservation.check_out_date,
    'guests_count', v_reservation.guests_count,
    'arrival_time', v_reservation.arrival_time,
    'total_amount', v_reservation.total_amount,
    'precheckin_token_expires_at',
      v_reservation.precheckin_token_expires_at
  );
END;
$_$;


--
-- Name: save_precheckin_guests(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_precheckin_guests(p_token_hash text, p_guests jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
DECLARE
  v_reservation record;
  v_guest jsonb;
  v_existing record;
  v_expected_count integer;
  v_existing_count integer;
  v_index integer := 0;
  v_name text;
  v_gender text;
  v_age_group text;
  v_address text;
  v_contact text;
  v_phone text;
  v_email text;
  v_nationality text;
  v_passport text;
  v_japan_resident boolean;
  v_now timestamptz := pg_catalog.now();
BEGIN
  IF p_token_hash IS NULL
     OR p_token_hash !~ '^[a-f0-9]{64}$'
     OR pg_catalog.jsonb_typeof(p_guests) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_guests) < 1
     OR pg_catalog.jsonb_array_length(p_guests) > 20
  THEN
    RAISE EXCEPTION 'Invalid registration request';
  END IF;

  SELECT
    r.id,
    r.status,
    r.guests_count,
    r.precheckin_token_expires_at,
    r.precheckin_token_used_at
  INTO v_reservation
  FROM public.reservations AS r
  WHERE r.precheckin_token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_reservation.status IS DISTINCT FROM 'approved'
     OR v_reservation.precheckin_token_expires_at IS NULL
     OR v_reservation.precheckin_token_expires_at < v_now
  THEN
    RAISE EXCEPTION 'Invalid or expired registration link';
  END IF;

  v_expected_count := GREATEST(
    1,
    LEAST(20, COALESCE(v_reservation.guests_count, 1))
  );

  IF pg_catalog.jsonb_array_length(p_guests) <> v_expected_count THEN
    RAISE EXCEPTION 'Guest count mismatch';
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_existing_count
  FROM public.reservation_guests AS g
  WHERE g.reservation_id = v_reservation.id;

  IF v_existing_count > v_expected_count THEN
    RAISE EXCEPTION 'Existing guest records require review';
  END IF;

  FOR v_guest IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(p_guests)
  LOOP
    v_index := v_index + 1;

    IF pg_catalog.jsonb_typeof(v_guest) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid guest data';
    END IF;

    IF pg_catalog.jsonb_typeof(v_guest -> 'japan_resident')
       IS DISTINCT FROM 'boolean'
    THEN
      RAISE EXCEPTION 'Japan residence selection is required';
    END IF;

    v_japan_resident := (v_guest ->> 'japan_resident')::boolean;

    v_name := pg_catalog.btrim(v_guest ->> 'guest_name');
    v_gender := pg_catalog.btrim(v_guest ->> 'gender');
    v_age_group := pg_catalog.btrim(v_guest ->> 'age_group');
    v_address := pg_catalog.btrim(v_guest ->> 'guest_address');
    v_phone := pg_catalog.btrim(v_guest ->> 'guest_phone');
    v_email := pg_catalog.btrim(v_guest ->> 'guest_email');
    v_contact := v_phone;
    v_nationality := pg_catalog.btrim(v_guest ->> 'nationality');
    v_passport := pg_catalog.btrim(v_guest ->> 'passport_number');

    IF v_name IS NULL OR v_name = ''
       OR v_gender IS NULL OR v_gender NOT IN ('男性', '女性', '回答しない/その他')
       OR v_age_group IS NULL OR v_age_group NOT IN (
         '10代以下', '20代', '30代', '40代', '50代', '60代以上'
       )
       OR v_address IS NULL OR v_address = ''
       OR v_phone IS NULL OR v_phone = ''
       OR v_email IS NULL OR v_email = ''
    THEN
      RAISE EXCEPTION 'Required guest fields are missing or invalid';
    END IF;

    -- メールアドレスの正規表現を修正
    IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RAISE EXCEPTION 'Invalid email address';
    END IF;

    IF NOT v_japan_resident
       AND (
         v_nationality IS NULL OR v_nationality = ''
         OR v_passport IS NULL OR v_passport = ''
       )
    THEN
      RAISE EXCEPTION 'Nationality and passport are required';
    END IF;

    IF pg_catalog.char_length(v_name) > 200
       OR pg_catalog.char_length(v_gender) > 30
       OR pg_catalog.char_length(v_age_group) > 30
       OR pg_catalog.char_length(v_address) > 500
       OR pg_catalog.char_length(v_phone) > 200
       OR pg_catalog.char_length(v_email) > 200
       OR pg_catalog.char_length(v_nationality) > 200
       OR pg_catalog.char_length(v_passport) > 200
    THEN
      RAISE EXCEPTION 'Guest field length exceeded';
    END IF;

    SELECT g.id
    INTO v_existing
    FROM public.reservation_guests AS g
    WHERE g.reservation_id = v_reservation.id
    ORDER BY g.created_at, g.id
    OFFSET v_index - 1
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.reservation_guests
      SET
        is_primary_guest = (v_index = 1),
        guest_name = v_name,
        gender = v_gender,
        age_group = v_age_group,
        guest_address = v_address,
        guest_contact = v_contact,
        guest_phone = v_phone,
        guest_email = v_email,
        nationality = CASE WHEN v_japan_resident THEN '' ELSE v_nationality END,
        passport_number = CASE WHEN v_japan_resident THEN '' ELSE v_passport END,
        precheckin_completed_at = v_now,
        guest_register_completed_at = v_now,
        updated_at = v_now
      WHERE id = v_existing.id;
    ELSE
      INSERT INTO public.reservation_guests (
        reservation_id,
        is_primary_guest,
        guest_name,
        gender,
        age_group,
        guest_address,
        guest_contact,
        guest_phone,
        guest_email,
        nationality,
        passport_number,
        precheckin_completed_at,
        guest_register_completed_at,
        created_at,
        updated_at
      )
      VALUES (
        v_reservation.id,
        (v_index = 1),
        v_name,
        v_gender,
        v_age_group,
        v_address,
        v_contact,
        v_phone,
        v_email,
        CASE WHEN v_japan_resident THEN '' ELSE v_nationality END,
        CASE WHEN v_japan_resident THEN '' ELSE v_passport END,
        v_now,
        v_now,
        v_now,
        v_now
      );
    END IF;
  END LOOP;

  

  RETURN pg_catalog.jsonb_build_object(
    'success', true,
    'message', '事前登録を受け付けました。'
  );
END;
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id integer DEFAULT 1 NOT NULL,
    base_price integer DEFAULT 5000 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_settings_base_price_check CHECK ((base_price >= 0)),
    CONSTRAINT app_settings_id_check CHECK ((id = 1))
);


--
-- Name: booking_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_settings (
    id integer DEFAULT 1 NOT NULL,
    booking_end_date date NOT NULL,
    pause_start_date date,
    pause_end_date date,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT booking_settings_id_check CHECK ((id = 1)),
    CONSTRAINT valid_pause_period CHECK ((((pause_start_date IS NULL) AND (pause_end_date IS NULL)) OR ((pause_start_date IS NOT NULL) AND (pause_end_date IS NOT NULL) AND (pause_start_date <= pause_end_date))))
);


--
-- Name: function_backup_complete_admin_checkin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.function_backup_complete_admin_checkin (
    backed_up_at timestamp with time zone DEFAULT now() NOT NULL,
    function_definition text NOT NULL
);


--
-- Name: reservation_guests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservation_guests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reservation_id uuid NOT NULL,
    is_primary_guest boolean DEFAULT false NOT NULL,
    guest_name text NOT NULL,
    guest_address text,
    guest_contact text,
    guest_occupation text,
    nationality text,
    passport_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    precheckin_completed_at timestamp with time zone,
    terms_version text,
    terms_accepted_at timestamp with time zone,
    guest_register_completed_at timestamp with time zone,
    gender text,
    age_group text,
    guest_phone text,
    guest_email text
);


--
-- Name: reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    check_in_date date NOT NULL,
    check_out_date date NOT NULL,
    guests_count integer NOT NULL,
    arrival_time text NOT NULL,
    guest_name text NOT NULL,
    guest_gender text NOT NULL,
    guest_age_group text NOT NULL,
    guest_email text NOT NULL,
    guest_phone text NOT NULL,
    payment_method text NOT NULL,
    total_amount integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    checkin_qr_code text NOT NULL,
    reservation_code character varying(10),
    payment_status text DEFAULT 'unpaid'::text NOT NULL,
    precheckin_token_hash text,
    precheckin_token_expires_at timestamp with time zone,
    precheckin_token_used_at timestamp with time zone,
    nights integer
);


--
-- Name: room_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_availability (
    id bigint NOT NULL,
    target_date date NOT NULL,
    total_rooms integer DEFAULT 1,
    booked_rooms integer DEFAULT 0,
    is_blocked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    price numeric DEFAULT '5000'::numeric,
    max_guests numeric DEFAULT '4'::numeric
);


--
-- Name: room_availability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.room_availability ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.room_availability_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: booking_settings booking_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_settings
    ADD CONSTRAINT booking_settings_pkey PRIMARY KEY (id);


--
-- Name: reservation_guests reservation_guests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_guests
    ADD CONSTRAINT reservation_guests_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_pkey PRIMARY KEY (id);


--
-- Name: reservations reservations_reservation_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservations
    ADD CONSTRAINT reservations_reservation_code_key UNIQUE (reservation_code);


--
-- Name: room_availability room_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_availability
    ADD CONSTRAINT room_availability_pkey PRIMARY KEY (id);


--
-- Name: room_availability room_availability_target_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_availability
    ADD CONSTRAINT room_availability_target_date_key UNIQUE (target_date);


--
-- Name: idx_reservation_guests_reservation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservation_guests_reservation_id ON public.reservation_guests USING btree (reservation_id);


--
-- Name: idx_target_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_target_date ON public.room_availability USING btree (target_date);


--
-- Name: reservation_guests reservation_guests_reservation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservation_guests
    ADD CONSTRAINT reservation_guests_reservation_id_fkey FOREIGN KEY (reservation_id) REFERENCES public.reservations(id) ON DELETE RESTRICT;


--
-- Name: reservations Allow insert for all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow insert for all" ON public.reservations FOR INSERT WITH CHECK (true);


--
-- Name: function_backup_complete_admin_checkin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.function_backup_complete_admin_checkin ENABLE ROW LEVEL SECURITY;

--
-- Name: reservation_guests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservation_guests ENABLE ROW LEVEL SECURITY;

--
-- Name: reservations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;

--
-- Name: room_availability; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.room_availability ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict 3GMGEnYr0EJ7iotrkbzOzSmVcWDzikaKJ7fFKqv2n0IJBFuP3lRofzcBvBZd5fz

