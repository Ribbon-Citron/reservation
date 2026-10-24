# Supabase reservation — 構造確認メモ
作成日: 2026-10-24

## 重要な注意
これはSQL Editorで取得した確認結果をまとめた「記録用メモ」です。完全な復元用バックアップではありません。DDL全文、すべての制約定義、RLSの有効状態、権限・トリガー・関数などは未確認です。

## プロジェクト
- Project name: reservation
- Project ref: dpirhczosxernkvgwxqc
- Region: Northeast Asia (Tokyo)

## public テーブル一覧
- app_settings
- booking_settings
- reservations
- room_availability

## 列構造

### app_settings
| 順番 | 列 | 型 | NULL可 | デフォルト |
|---:|---|---|---|---|
| 1 | id | integer | NO | 1 |
| 2 | base_price | integer | NO | 5000 |
| 3 | updated_at | timestamp with time zone | NO | now() |

### booking_settings
| 順番 | 列 | 型 | NULL可 | デフォルト |
|---:|---|---|---|---|
| 1 | id | integer | NO | 1 |
| 2 | booking_end_date | date | NO | null |
| 3 | pause_start_date | date | YES | null |
| 4 | pause_end_date | date | YES | null |
| 5 | updated_at | timestamp with time zone | NO | now() |

### reservations
| 順番 | 列 | 型 | NULL可 | デフォルト |
|---:|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | created_at | timestamp with time zone | NO | timezone('utc'::text, now()) |
| 3 | check_in_date | date | NO | null |
| 4 | check_out_date | date | NO | null |
| 5 | guests_count | integer | NO | null |
| 6 | arrival_time | text | NO | null |
| 7 | guest_name | text | NO | null |
| 8 | guest_gender | text | NO | null |
| 9 | guest_age_group | text | NO | null |
| 10 | guest_email | text | NO | null |
| 11 | guest_phone | text | NO | null |
| 12 | payment_method | text | NO | null |
| 13 | total_amount | integer | NO | null |
| 14 | status | text | NO | 'pending'::text |
| 15 | checkin_qr_code | text | NO | null |
| 16 | reservation_code | character varying | YES | null |
| 17 | payment_status | text | NO | 'unpaid'::text |

### room_availability
| 順番 | 列 | 型 | NULL可 | デフォルト |
|---:|---|---|---|---|
| 1 | id | bigint | NO | null |
| 2 | target_date | date | NO | null |
| 3 | total_rooms | integer | YES | 1 |
| 4 | booked_rooms | integer | YES | 0 |
| 5 | is_blocked | boolean | YES | false |
| 6 | created_at | timestamp with time zone | YES | now() |
| 7 | price | numeric | YES | '5000'::numeric |
| 8 | max_guests | numeric | YES | '4'::numeric |

## 確認された制約
- app_settings: PRIMARY KEY app_settings_pkey(id); CHECK app_settings_base_price_check（定義全文未取得）; CHECK app_settings_id_check（定義全文未取得）
- booking_settings: PRIMARY KEY booking_settings_pkey(id); CHECK booking_settings_id_check（定義全文未取得）; CHECK valid_pause_period（定義全文未取得）
- reservations: PRIMARY KEY reservations_pkey(id); UNIQUE reservations_reservation_code_key(reservation_code)
- room_availability: PRIMARY KEY room_availability_pkey(id); UNIQUE room_availability_target_date_key(target_date)
- 各テーブルに NOT NULL 関連制約が表示されました（自動生成名）。
- 外部キーは取得した一覧には表示されませんでした。

## 確認されたインデックス
- app_settings_pkey: UNIQUE btree (id)
- booking_settings_pkey: UNIQUE btree (id)
- reservations_pkey: UNIQUE btree (id)
- reservations_reservation_code_key: UNIQUE btree (reservation_code)
- room_availability_pkey: UNIQUE btree (id)
- room_availability_target_date_key: UNIQUE btree (target_date)
- idx_target_date: btree (target_date)

## 確認されたRLSポリシー
- テーブル: reservations
- ポリシー名: Allow insert for all
- permissive: PERMISSIVE
- roles: {public}
- cmd: INSERT
- qual: null
- with_check: true

注意: この結果はポリシーの存在を示しますが、テーブルごとのRLS有効状態そのものは確認していません。このポリシーは本番公開前に見直してください。

## データ削除前の注意
- app_settings と booking_settings は設定値を保持するため、削除対象に含めるか慎重に判断する。
- reservations と room_availability は予約・空室関連データを保持する。
- Supabase管理用の auth / storage スキーマは今回の対象4テーブルとは別であり、削除しない。
- このメモを保存しただけでは、完全な構造バックアップを取得したことにはならない。
