CREATE OR REPLACE FUNCTION public.save_precheckin_guests(p_token_hash text, p_guests jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

    IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' THEN
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
$function$;
