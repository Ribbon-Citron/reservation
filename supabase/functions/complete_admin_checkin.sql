CREATE OR REPLACE FUNCTION public.complete_admin_checkin(p_reservation_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;
