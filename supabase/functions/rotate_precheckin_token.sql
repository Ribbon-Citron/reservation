CREATE OR REPLACE FUNCTION public.rotate_precheckin_token(p_reservation_id uuid, p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_reservation record;
BEGIN
  IF p_reservation_id IS NULL
     OR p_token_hash IS NULL
     OR p_token_hash !~ '^[a-f0-9]{64}$'
  THEN
    RAISE EXCEPTION 'Invalid request';
  END IF;

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
$function$;
