import type {
  District,
  ErrorCode,
  IdCheckReason,
  ValidationRule,
} from '@/api/generated/codes';
import type { NotificationKind } from '@/api/generated/notifications';

/**
 * English, the source of every key: bn.ts must have the same shape (the
 * type check enforces it). The error codes, input rules and notification
 * kinds are checked against the lists the backend publishes, so none can be
 * left without wording.
 *
 * Values in sentences use a format, so Bengali gets Bengali digits:
 * {{n, number}}, {{amount, taka}}, {{at, date}}, {{at, datetime}},
 * {{role, role}}, {{status, word}}. Counted words nest a plural:
 * $t(units.slot, {"count": {{slots}} }). Names that have a Bengali form
 * (a produce, a measurement) arrive in the reader's language already.
 */
export const en = {
  language: {
    label: 'Language',
    notSaved:
      'Your language could not be saved to your account. It applies on this device only.',
  },
  units: {
    try_one: '{{count, number}} try',
    try_other: '{{count, number}} tries',
    minute_one: '{{count, number}} minute',
    minute_other: '{{count, number}} minutes',
    slot_one: '{{count, number}} slot',
    slot_other: '{{count, number}} slots',
  },
  roles: {
    super_admin: 'Super admin',
    admin: 'Admin',
    operations: 'Operations',
    accounts: 'Accounts',
    field_officer: 'Field officer',
    farmer: 'Farmer',
    investor: 'Investor',
    warehouse: 'Warehouse operator',
    bank: 'Bank',
    supplier: 'Supplier',
    buyer: 'Buyer',
    insurer: 'Insurer',
    auditor: 'Auditor',
  },
  /** By the code the API uses. */
  districts: {
    BARGUNA: 'Barguna',
    BARISHAL: 'Barishal',
    BHOLA: 'Bhola',
    JHALOKATI: 'Jhalokati',
    PATUAKHALI: 'Patuakhali',
    PIROJPUR: 'Pirojpur',
    BANDARBAN: 'Bandarban',
    BRAHMANBARIA: 'Brahmanbaria',
    CHANDPUR: 'Chandpur',
    CHATTOGRAM: 'Chattogram',
    CUMILLA: 'Cumilla',
    COXS_BAZAR: "Cox's Bazar",
    FENI: 'Feni',
    KHAGRACHHARI: 'Khagrachhari',
    LAKSHMIPUR: 'Lakshmipur',
    NOAKHALI: 'Noakhali',
    RANGAMATI: 'Rangamati',
    DHAKA: 'Dhaka',
    FARIDPUR: 'Faridpur',
    GAZIPUR: 'Gazipur',
    GOPALGANJ: 'Gopalganj',
    KISHOREGANJ: 'Kishoreganj',
    MADARIPUR: 'Madaripur',
    MANIKGANJ: 'Manikganj',
    MUNSHIGANJ: 'Munshiganj',
    NARAYANGANJ: 'Narayanganj',
    NARSINGDI: 'Narsingdi',
    RAJBARI: 'Rajbari',
    SHARIATPUR: 'Shariatpur',
    TANGAIL: 'Tangail',
    BAGERHAT: 'Bagerhat',
    CHUADANGA: 'Chuadanga',
    JASHORE: 'Jashore',
    JHENAIDAH: 'Jhenaidah',
    KHULNA: 'Khulna',
    KUSHTIA: 'Kushtia',
    MAGURA: 'Magura',
    MEHERPUR: 'Meherpur',
    NARAIL: 'Narail',
    SATKHIRA: 'Satkhira',
    JAMALPUR: 'Jamalpur',
    MYMENSINGH: 'Mymensingh',
    NETROKONA: 'Netrokona',
    SHERPUR: 'Sherpur',
    BOGURA: 'Bogura',
    JOYPURHAT: 'Joypurhat',
    NAOGAON: 'Naogaon',
    NATORE: 'Natore',
    CHAPAI_NAWABGANJ: 'Chapai Nawabganj',
    PABNA: 'Pabna',
    RAJSHAHI: 'Rajshahi',
    SIRAJGANJ: 'Sirajganj',
    DINAJPUR: 'Dinajpur',
    GAIBANDHA: 'Gaibandha',
    KURIGRAM: 'Kurigram',
    LALMONIRHAT: 'Lalmonirhat',
    NILPHAMARI: 'Nilphamari',
    PANCHAGARH: 'Panchagarh',
    RANGPUR: 'Rangpur',
    THAKURGAON: 'Thakurgaon',
    HABIGANJ: 'Habiganj',
    MOULVIBAZAR: 'Moulvibazar',
    SUNAMGANJ: 'Sunamganj',
    SYLHET: 'Sylhet',
  } satisfies Record<District, string>,
  /** Statuses, stages and other values shown inside sentences: {{status, word}}. */
  words: {
    none: 'no longer active',
    submitted: 'still being confirmed',
    pending: 'pending',
    confirmed: 'confirmed',
    expired: 'expired',
    cancelled: 'cancelled',
    proposed: 'proposed',
    active: 'active',
    rejected: 'rejected',
    approved: 'approved',
    registered: 'registered',
    verified: 'verified',
    issued: 'issued',
    pending_handover: 'waiting for handover',
    listed: 'listed for sale',
    sold: 'sold',
    collected: 'collected',
    sold_out: 'sold out',
    open: 'open',
    withdrawn: 'withdrawn',
    paid: 'paid',
    delivered: 'delivered',
    triggered: 'opened, not yet under review',
    under_review: 'under review',
    prepared: 'waiting for approval',
    recorded: 'recorded',
    voided: 'voided',
    draft: 'a draft',
    open_for_funding: 'open for funding',
    funded: 'funded',
    ready_for_sale: 'ready for sale',
    paid_out: 'paid out',
    closed: 'closed',
    buyer: 'buyer',
    handler: 'one handing over',
    'node-unreachable': 'the blockchain node could not be reached',
    'indexer-behind': 'the database fell behind the ledger',
    'indexer-failing': 'copying ledger events kept failing',
  },
  errors: {
    /** When a failure has no wording of its own. */
    kind: {
      network:
        'Can’t reach WeGro. Check your internet connection and try again.',
      unauthenticated: 'Please sign in again.',
      forbidden: 'You don’t have permission to do this.',
      'not-found': 'This could not be found. It may have been removed.',
      invalid: 'Some details need fixing. Check them and try again.',
      conflict:
        'This can’t be done now: the record has changed. Refresh and try again.',
      'rate-limited': 'Too many attempts. Wait a moment and try again.',
      unavailable:
        'The service is unavailable for a moment. Try again shortly.',
      server: 'Something went wrong on our side. Please try again.',
    },
    /** By the backend's error code (ledger refusals fall back to their kind). */
    code: {
      BAD_CREDENTIALS: 'The number or email, or the password, is not right.',
      ACCOUNT_LOCKED:
        'Too many failed sign-in attempts. Try again in $t(units.minute, {"count": {{minutes}} }).',
      SIGN_IN_REQUIRED: 'Please sign in.',
      SESSION_EXPIRED: 'Your session has expired. Please sign in again.',
      SESSION_ENDED: 'You were signed out. Please sign in again.',
      PASSWORD_CHANGE_REQUIRED: 'Change your temporary password first.',
      REGISTRATION_CONFIRMING:
        'Your registration is still being confirmed. Try again shortly.',
      ACCOUNT_REJECTED: 'This account was not approved.',
      ACCOUNT_NOT_VERIFIED: 'Your account is not verified yet.',
      WRONG_CURRENT_PASSWORD: 'Your current password is incorrect.',
      PASSWORD_UNCHANGED:
        'The new password must be different from the current one.',
      NO_DEMO_ACCOUNT: 'There is no demo account for {{role, role}} yet.',
      ROLE_NOT_ALLOWED: 'Your role cannot do this.',
      AUDITOR_READ_ONLY: 'Auditors can only view, not change anything.',
      NOT_FOUND: 'This could not be found.',
      FORBIDDEN: 'You don’t have permission to do this.',
      CONFLICT: 'This can’t be done right now.',
      INVALID_REQUEST:
        'The request could not be understood. Check the details and try again.',
      INVALID_INPUT: 'Some details are missing or not valid: {{fields}}',
      INVALID_DETAILS: 'Some details are not valid: {{problems}}',
      REQUEST_TOO_LARGE: 'This is too large to send.',
      UNSUPPORTED_MEDIA_TYPE: 'This kind of file is not accepted.',
      TOO_MANY_REQUESTS: 'Too many attempts. Wait a moment and try again.',
      SERVICE_UNAVAILABLE:
        'The service is unavailable for a moment. Try again shortly.',
      SERVER_ERROR: 'Something went wrong on our side. Please try again.',
      DATABASE_UNAVAILABLE: 'The database cannot be reached right now.',
      LEDGER_UNAVAILABLE:
        'The ledger cannot be reached right now. Try again shortly.',
      LEDGER_FAILED: 'The ledger could not record this. Please try again.',
      READ_MODEL_UPDATE_FAILED:
        'Saved on the ledger; it will appear here shortly. Don’t do it again.',
      CHANGED_MEANWHILE:
        'This changed while you were working. Refresh and try again.',
      RECORD_NOT_FOUND: 'This record could not be found.',
      UNKNOWN_RECORD_TYPE: 'This kind of record is not known.',
      NOTIFICATION_NOT_FOUND: 'This notification could not be found.',
      JOB_NOT_FOUND: 'There is no job named {{job}}.',
      JOB_RUNNING: '{{job}} is already running. Try again when it finishes.',
      SWEEP_RUNNING: 'A check of all records is already running.',
      SWEEP_NOT_FOUND: 'This check could not be found.',
      PARTICIPANT_NOT_FOUND: 'This person could not be found.',
      FARMER_NOT_FOUND: 'This farmer could not be found.',
      PHONE_ALREADY_REGISTERED: 'This phone number is already registered.',
      NID_ALREADY_REGISTERED: 'A person with this NID is already registered.',
      ID_CHECK_FAILED: 'The ID check failed. Check the details and try again.',
      ID_CHECK_FLAGS_NOT_ACKNOWLEDGED:
        'The ID check raised flags. Review them and confirm before verifying.',
      DETAILS_MISMATCH:
        'The stored details don’t match the ledger, so this person can’t be verified.',
      LEDGER_MISMATCH: 'The ledger record doesn’t match this person.',
      REGISTRATION_UNCONFIRMED:
        'Saved, but not confirmed on the ledger yet. It will be confirmed automatically.',
      PARTICIPANT_UNCONFIRMED:
        'This person’s registration isn’t confirmed on the ledger yet.',
      ALREADY_VERIFIED: 'This person is already verified.',
      ALREADY_REJECTED: 'This person is already rejected.',
      NOT_A_FARMER: 'Only farmers have a field officer.',
      FIELD_OFFICER_INVALID: 'Choose a verified field officer.',
      ALREADY_ASSIGNED: 'This farmer already has this field officer.',
      KEY_REPLACEMENT_PENDING: 'A key replacement is already in progress.',
      NO_FINGERPRINT: 'No ledger fingerprint is stored for this person.',
      STAFF_REGISTERED_BY_SUPER_ADMIN:
        'Only the super admin can register staff.',
      REGISTRATION_NOT_ALLOWED:
        'Only admins and field officers can register people.',
      STAFF_MANAGED_BY_SUPER_ADMIN: 'Only the super admin can manage staff.',
      PARTICIPANTS_MANAGED_BY_ADMINS: 'Only admins can manage participants.',
      BANK_DETAILS_ALREADY_VERIFIED: 'These bank details are already verified.',
      SAME_PERSON:
        'Bank details must be verified by someone other than who entered them.',
      NOT_A_PAYEE: 'Only farmers and investors receive payouts.',
      NO_DETAILS_WAITING: 'No new bank details are waiting to be checked.',
      CATALOG_ENTRY_NOT_FOUND: 'There is no entry {{code}}.',
      CATALOG_CODE_EXISTS: 'An entry with this code already exists.',
      CATALOG_NAME_EXISTS: 'An entry with this name already exists.',
      CATALOG_CODE_UNKNOWN: '{{code}} is not in the catalog.',
      CATALOG_CODE_RETIRED: '{{code}} is no longer in use.',
      CATALOG_REFERENCE_UNKNOWN: 'A code this refers to does not exist.',
      UNIT_IN_USE: 'The unit {{unit}} is still used by: {{entries}}.',
      MEASUREMENT_KEY_REPEATED: 'The measurement {{key}} appears twice.',
      MEASUREMENT_RANGE_INVALID:
        '{{key}}: the lowest value is above the highest.',
      MEASUREMENT_BOUND_DECIMALS:
        '{{key}}: the limit {{bound, number}} has more than {{decimals, number}} decimal places.',
      PROJECT_NOT_FOUND: 'This project could not be found.',
      ALREADY_PUBLISHING: 'This project is already being published.',
      DRAFT_NEVER_PUBLISHED:
        'This draft was never published. Delete it instead.',
      PROJECT_NOT_PUBLISHED: 'Publish the project first.',
      PROJECT_PUBLISHED_LOCKED:
        'A published project can’t be changed or deleted.',
      INVALID_TERMS: 'The project terms are not valid: {{problems}}',
      TERMS_AMOUNTS_NOT_POSITIVE:
        'The funding target and slot price must be above zero.',
      TERMS_PARTIAL_SLOT: 'The funding target must be a whole number of slots.',
      TERMS_TOO_MANY_SLOTS: 'A project can have at most {{max, number}} slots.',
      TERMS_SHARES_NOT_100:
        'The farmer, investor and WeGro shares must add up to 100%.',
      TERMS_DURATION_RANGE:
        'The duration must be {{min, number}} to {{max, number}} months.',
      TERMS_SHORT_TOO_LONG:
        'A short-term project lasts at most {{max, number}} months.',
      TERMS_SHORT_HAS_INTERVAL:
        'A short-term project pays out once, at the end.',
      TERMS_LONG_TOO_SHORT:
        'A long-term project lasts more than {{min, number}} months.',
      TERMS_INTERVAL_TOO_LONG:
        'The payout interval can’t be longer than the project.',
      TERMS_ESTIMATES_REVERSED: 'The low estimate is above the high estimate.',
      TERMS_FARMER_NOT_VERIFIED: 'Choose a verified farmer.',
      PROJECT_NOT_OPEN: 'This project is not open for funding.',
      PROJECT_NOT_ACTIVE: 'This can be done only while the project is active.',
      NOT_ENOUGH_SLOTS: 'Only $t(units.slot, {"count": {{available}} }) left.',
      RESERVATION_NOT_FOUND: 'This reservation could not be found.',
      RESERVATION_WRONG_STATUS: 'This reservation is {{status, word}}.',
      RESERVATION_CONFIRMING: 'This reservation is already being confirmed.',
      PAYMENT_REF_INVALID: 'A payment reference must be 1 to 128 characters.',
      PAYMENT_REF_ALREADY_USED: 'This payment reference was already used.',
      REFUND_PROJECT_NOT_CANCELLED:
        'Refunds are recorded only for cancelled projects.',
      NO_SLOTS_HELD: 'This investor holds no slots in the project.',
      ALREADY_REFUNDED: 'This investor is already refunded.',
      REFUND_IN_PROGRESS:
        'A different refund for this investor is being recorded.',
      VOUCHER_NOT_FOUND: 'This voucher could not be found.',
      VOUCHER_PROJECT_STAGE:
        'Vouchers are issued only for funded or active projects.',
      EXCEEDS_FUNDING_TARGET:
        'The voucher is worth {{value, taka}}, but only {{room, taka}} of the funding is left for inputs.',
      VOUCHER_LIMITS_NOT_APPLICABLE:
        'Limits apply only to proposed or active vouchers.',
      VOUCHER_NOT_DISCARDABLE: 'Only unconfirmed proposals can be discarded.',
      VOUCHER_ON_LEDGER:
        'The ledger already has this voucher; it will appear shortly.',
      VOUCHER_NOT_ACTIVE: 'This voucher is not active.',
      VOUCHER_WRONG_STATUS: 'This voucher is {{status, word}}.',
      EXCEEDS_VOUCHER_QUANTITY:
        'Only {{available, number}} left on this voucher.',
      SUPPLIER_NOT_VERIFIED: 'Every supplier must be a verified supplier.',
      SALE_NOT_FOUND: 'This sale could not be found.',
      SALE_WRONG_STATUS: 'This sale is {{status, word}}.',
      SALE_CANCEL_NOT_ALLOWED: 'You can’t cancel this sale.',
      INVALID_BATCHES: 'Some batches can’t be used for this sale: {{problems}}',
      BATCH_NOT_FOUND: 'This batch could not be found.',
      BATCH_NOT_YOURS: '{{batch}} is not one of your batches.',
      BATCH_NOT_REGISTERED: '{{batch}} is not registered yet.',
      BATCH_WRONG_INPUT: '{{batch}} is a batch of {{input}}, not {{expected}}.',
      BATCH_EXPIRED: '{{batch}} has expired.',
      PRODUCED_IN_FUTURE: 'The production date can’t be in the future.',
      EXPIRES_BEFORE_PRODUCED:
        'The expiry date can’t be before the production date.',
      LOT_ALREADY_REGISTERED:
        'You already registered this lot number for this input.',
      FARM_UPDATE_WRONG_STAGE:
        'Farm updates are recorded from funding until the crop is ready for sale.',
      NOT_FARMERS_OFFICER: 'Only the farmer’s own field officer can do this.',
      INVALID_RECORD: 'The farm update is not valid: {{problems}}',
      FIELD_RECORD_NOT_FOUND: 'This farm update could not be found.',
      RECORD_HAS_NO_PHOTO: 'This farm update has no photo.',
      MEASUREMENT_UNKNOWN:
        '{{key}} is not a measurement of this kind of update.',
      MEASUREMENT_REQUIRED: '{{label}} is required.',
      MEASUREMENT_NOT_A_NUMBER:
        '{{label}} must be a number with at most {{decimals, number}} decimal places.',
      MEASUREMENT_BELOW_MIN:
        '{{label}} is below the minimum of {{min, number}}.',
      MEASUREMENT_ABOVE_MAX:
        '{{label}} is above the maximum of {{max, number}}.',
      LOCATION_INCOMPLETE: 'Give both latitude and longitude, or neither.',
      COORDINATES_INVALID: 'The location is not valid.',
      LOCATION_OUTSIDE_BANGLADESH: 'The location is outside Bangladesh.',
      LOCATION_REQUIRED: '{{recordType}} needs the location.',
      PHOTO_REQUIRED: '{{recordType}} needs a photo.',
      PHOTO_NOT_YOURS: 'The photo must be one you took and uploaded.',
      CORRECTION_OTHER_PROJECT:
        'A correction must be for an update of the same project.',
      OBSERVED_AT_INVALID: 'The time of the update is not valid.',
      OBSERVED_AT_FUTURE:
        'The time of the update is in the future. Check the phone’s clock.',
      DUPLICATE_IN_BATCH: 'The same update was sent twice in this batch.',
      CORRECTION_CYCLE:
        'Corrections in this batch refer to each other in a circle.',
      ENTRY_ID_REUSED:
        'This draft was already sent with different content. Start a new update.',
      NOT_CONFIRMED:
        'Not confirmed by the ledger yet. Keep the draft and send it again later.',
      PHOTO_FIELD_MISSING: 'No photo was attached.',
      PHOTO_SIZE: 'A photo can be at most {{maxMb, number}} MB.',
      PHOTO_TYPE: 'Photos must be JPEG, PNG or WebP.',
      PHOTO_DAMAGED: 'The image file is damaged.',
      PHOTO_NOT_FOUND: 'This photo could not be found.',
      PHOTO_FILE_MISSING: 'The photo file is missing.',
      TOO_MANY_PHOTOS: 'At most {{max, number}} photos.',
      SITE_NOT_FOUND: 'This warehouse site could not be found.',
      SITE_NAME_EXISTS: 'A site with this name already exists.',
      WAREHOUSE_OPERATOR_INVALID: 'Choose a verified warehouse operator.',
      NOT_SITE_OPERATOR: 'You are not assigned to a warehouse site.',
      NOT_ISSUING_SITE_OPERATOR:
        'Only an operator of the site that issued it can do this.',
      NOT_STORABLE: 'Fresh produce is sold directly, not stored.',
      RECEIPT_NOT_FOUND: 'This receipt could not be found.',
      RECEIPT_WRONG_STATUS: 'This receipt is {{status, word}}.',
      RECEIPT_NOT_ISSUED:
        'Only an issued receipt can be used for this; this one is {{status, word}}.',
      RECEIPT_EXPIRED:
        'This receipt has expired. The site must re-check and extend it first.',
      HANDOVER_CANCEL_NOT_ALLOWED: 'You can’t cancel this handover.',
      NO_HANDOVER_WAITING: 'No handover is waiting on this receipt.',
      INTAKE_IN_FUTURE: 'The intake date can’t be in the future.',
      EXPIRY_IN_PAST: 'The end date can’t be in the past.',
      EXPIRES_BEFORE_INTAKE: 'The end date can’t be before the intake date.',
      CHECK_IN_FUTURE: 'The re-check date can’t be in the future.',
      NEW_EXPIRY_NOT_LATER: 'The new end date must be after {{current, date}}.',
      LISTING_NOT_FOUND: 'This listing could not be found.',
      LISTING_WRONG_STATUS: 'This listing is {{status, word}}.',
      LISTING_NOT_ALLOWED:
        'Only an admin or the farmer’s field officer can list this.',
      LISTING_CANCEL_NOT_ALLOWED:
        'Only the seller’s side or an admin can cancel this listing.',
      NOT_RECEIPT_OWNER: 'Only the receipt owner’s side can list it.',
      NOT_PERISHABLE:
        'Stored crops and spices are sold through their warehouse receipts.',
      DEALS_PENDING:
        '{{unpaidDeals, number}} approved deals are still waiting for payment.',
      EXCEEDS_AVAILABLE: 'Only {{available, number}} available.',
      OFFER_NOT_FOUND: 'This offer could not be found.',
      OFFER_WRONG_STATUS: 'This offer is {{status, word}}.',
      PAYMENT_OVERDUE: 'The payment deadline for this deal has passed.',
      DEAL_CONFIRMING: 'This deal is already being confirmed.',
      DELIVERY_CONFIRM_NOT_ALLOWED:
        'Only the buyer or the one handing over confirms delivery.',
      DELIVERY_ALREADY_CONFIRMED:
        'The {{side, word}} has already confirmed this delivery.',
      DELIVERY_HAS_NO_PHOTO: 'This delivery has no photo.',
      REQUEST_NOT_FOUND: 'This request could not be found.',
      REQUEST_ALREADY_CANCELLED: 'This request is already cancelled.',
      VALID_UNTIL_IN_PAST: 'The closing date can’t be in the past.',
      NO_COVERAGE: 'No insurer covers this project yet.',
      NOT_INSURED: 'This project is not insured.',
      OTHER_INSURER: 'Another insurer covers this project.',
      INSURANCE_PROJECT_STAGE:
        'Insurance applies while the crop is in the field; this project is {{stage, word}}.',
      COVER_UNCHANGED: 'These are already the current terms.',
      COVERAGE_BELOW_APPROVED:
        'Claims of {{approvedTotal, taka}} are already approved; the cover can’t be less.',
      AMOUNT_NOT_POSITIVE: 'The amount must be above zero.',
      DAMAGE_NOT_POSITIVE: 'The damage must be above 0%.',
      OCCURRED_IN_FUTURE: 'The date of the event can’t be in the future.',
      WEATHER_EVENT_NOT_FOUND: 'This weather event could not be found.',
      WEATHER_EVENT_INVALID: 'Choose a recorded weather event.',
      REGION_MISMATCH:
        'The weather event was in a different district from the project.',
      EVENT_NOT_COVERED:
        'The cover doesn’t include this kind of weather event.',
      ALREADY_CLAIMED: 'This project has already claimed for this event.',
      EXCEEDS_COVERAGE: 'Only {{remaining, taka}} of the cover remains.',
      CLAIM_NOT_FOUND: 'This claim could not be found.',
      CLAIM_NOT_ALLOWED:
        'Only the farmer’s field officer or an admin can claim.',
      CLAIM_WRONG_STATUS: 'This claim is {{status, word}}.',
      REVIEW_NOT_STARTED: 'Start the review of this claim first.',
      NOT_PROJECT_INSURER: 'Only the project’s insurer can review this claim.',
      CLAIM_PHOTO_NOT_FOUND: 'This claim has no such photo.',
      CLAIM_HAS_NO_PHOTO: 'This claim has no assessment photo.',
      COST_NOT_FOUND: 'This cost could not be found.',
      COST_PROJECT_STAGE:
        'Costs are entered while a project is funded, active or ready for sale; this one is {{stage, word}}.',
      INCURRED_IN_FUTURE: 'The date of the cost can’t be in the future.',
      COST_ALREADY_VOIDED: 'This cost is already voided.',
      COST_HAS_NO_PHOTO: 'This cost has no bill photo.',
      FINAL_ROUND_OPEN: 'A final round is open; reject it to change costs.',
      ALREADY_SETTLED: 'This project is already settled.',
      ROUND_OPEN: 'Another payout round for this project is still open.',
      ROUND_WRONG_STAGE:
        'Staged rounds are for active projects, the final round for projects ready for sale.',
      NOT_STAGED: 'This project pays out only once, at the end.',
      TOO_EARLY: 'The next payout round is not due yet.',
      NOTHING_TO_DISTRIBUTE: 'There is no new profit to share.',
      STILL_OUTSTANDING:
        'Everything that feeds the final figures must be finished first.',
      ROUND_NOT_FOUND: 'This payout round could not be found.',
      ROUND_WRONG_STATUS: 'This payout round is {{status, word}}.',
      SAME_ACCOUNTANT:
        'A round must be approved by someone other than who prepared it.',
      ROUND_NOT_VERIFIED:
        'The figures here don’t match the ledger. Reject this round.',
      NOT_IN_ROUND: 'This person is not paid in this round.',
      ALREADY_PAID: 'This line is already paid.',
      LINE_NOT_VERIFIED: 'The amount for this line doesn’t match the ledger.',
      PAYMENT_IN_PROGRESS:
        'A different payment for this line is being recorded.',
      PERIOD_REVERSED: 'The end of the period can’t be before its start.',
      PERIOD_TOO_LONG: 'A period can be at most {{maxDays, number}} days.',
      NO_STATEMENT: 'There is no statement for this person.',
      BANK_NOT_FOUND: 'This bank could not be found.',
      BANK_EXISTS: 'This bank branch is already registered.',
      BANK_OFFICER_INVALID: 'Choose a verified bank officer.',
      NOT_ASSIGNED_TO_BANK: 'You are not assigned to a bank.',
      NO_FINISHED_PROJECTS: 'The farmer has no finished projects yet.',
      UNCHANGED: 'Nothing has changed since version {{version, number}}.',
      VERSION_NOT_FOUND: 'This version could not be found.',
      NO_TRACK_RECORD: 'This farmer has no track record yet.',
      NO_ACTIVE_CONSENT: 'This farmer has not given your bank permission.',
      NO_CONSENT_TO_WITHDRAW:
        'This bank has no current permission to withdraw.',
      CONSENT_NOT_FOUND: 'This permission could not be found.',
      EXPIRY_TOO_LATE:
        'Permission lasts at most a year: until {{latest, date}}. Renew it when it ends.',
      PHONE_INVALID: 'Enter a Bangladeshi mobile number, such as 01712345678.',
      CODE_WAIT:
        'Wait {{seconds, number}} seconds before asking for another code.',
      CODE_TOO_MANY:
        'Too many codes asked for. Try again in $t(units.minute, {"count": {{minutes}} }).',
      CODE_WRONG:
        'That code is not right. $t(units.try, {"count": {{attemptsLeft}} }) left.',
      CODE_EXPIRED: 'This code no longer works. Ask for a new one.',
      DETAILS_UNCHANGED: 'Nothing here is different from your current details.',
      PHONE_UNCHANGED: 'This is already your number.',
      PHONE_NOT_CONFIRMED: 'Confirm the new number with the code sent to it.',
      CHANGE_NOT_FOUND: 'No change of details is waiting.',
      CHANGE_NOT_PENDING: 'This change of details is {{status, word}}.',
      CHANGE_OWN_REQUEST:
        'Someone else must review your own change of details.',
      FIELD_OFFICER_FARMERS_ONLY: 'Field officers register farmers only.',
      EMAIL_ALREADY_REGISTERED: 'This email address is already in use.',
      EMAIL_UNCHANGED: 'This is already your email address.',
      EMAIL_NOT_SET: 'There is no email address on this account.',
    } satisfies Record<ErrorCode, string>,
    /** One failed input check: {{field}} and, where it has one, {{limit}}. */
    rule: {
      required: '{{field}} is required',
      notAllowed: '{{field}} is not allowed here',
      text: '{{field}} must be text',
      wholeNumber: '{{field}} must be a whole number',
      number: '{{field}} must be a number',
      yesNo: '{{field}} must be yes or no',
      date: '{{field}} must be a date',
      id: '{{field}} is not a valid ID',
      oneOf: '{{field}} is not one of the allowed choices',
      min: '{{field}} must be at least {{limit, number}}',
      max: '{{field}} can be at most {{limit, number}}',
      minLength: '{{field}} needs at least {{limit, number}} characters',
      maxLength: '{{field}} can have at most {{limit, number}} characters',
      format: '{{field}} is not in the right format',
      url: '{{field}} must be a web address',
      list: '{{field}} must be a list',
      listMin: '{{field}} needs at least {{limit, number}} items',
      listMax: '{{field}} can have at most {{limit, number}} items',
      unique: '{{field}} has the same item more than once',
      object: '{{field}} is not valid',
      invalid: '{{field}} is not valid',
    } satisfies Record<ValidationRule, string>,
  },
  /** By notification kind: reservation.made -> reservation.made.title. */
  notifications: {
    participant: {
      registered: {
        title: 'New registration awaiting verification: {{role, role}}',
      },
      verified: { title: 'Your account is verified' },
      rejected: { title: 'Your registration was not accepted' },
    },
    details: {
      'change-requested': {
        title:
          'A change of personal details is waiting for review: {{role, role}}',
      },
      'change-approved': { title: 'Your new details are approved' },
      'change-rejected': {
        title: 'Your change of details was not approved',
        body: '{{reason}}',
      },
    },
    farmer: {
      assigned: { title: 'A farmer was assigned to you' },
    },
    reservation: {
      made: {
        title: 'Reservation #{{reservationId}} awaiting payment confirmation',
        body: '$t(units.slot, {"count": {{slots}} }) in {{project}}; held until {{expiresAt, datetime}}',
      },
      confirmed: {
        title: 'Payment confirmed: your slots are issued',
        body: '$t(units.slot, {"count": {{slots}} }) in {{project}}',
      },
      expired: { title: 'Your reservation expired unpaid' },
      cancelled: { title: 'Your reservation was cancelled' },
      expiring: {
        title:
          'Your reservation of $t(units.slot, {"count": {{slots}} }) expires soon',
        body: '{{project}}: pay before {{expiresAt, datetime}} or the slots are released',
      },
    },
    project: {
      funded: {
        title: '{{project}} is fully funded: propose its input vouchers',
      },
      active: { title: '{{project}} is active' },
      'ready-for-sale': { title: '{{project}} is ready for its final payout' },
      'paid-out': { title: '{{project}} is paid out' },
      cancelled: {
        title: '{{project}} was cancelled: your money will be refunded',
      },
      'refunds-due': { title: '{{project}} was cancelled: refunds are due' },
    },
    refund: {
      paid: { title: 'Your refund has been paid', body: '{{project}}' },
    },
    voucher: {
      proposed: {
        title: 'Voucher awaiting approval',
        body: '{{quantity, number}} {{input}} for {{project}}',
      },
      approved: { title: 'Voucher approved: {{quantity, number}} {{input}}' },
      rejected: { title: 'Voucher rejected: {{quantity, number}} {{input}}' },
      cancelled: { title: 'Voucher cancelled: {{quantity, number}} {{input}}' },
      'inactive-soon': {
        title: 'The voucher for {{input}} nears its inactivity limit',
        body: '{{project}}: use it before {{deadline, datetime}}',
      },
      inactive: {
        title: 'The voucher for {{input}} has passed its inactivity limit',
        body: '{{project}}: an admin decides what happens next',
      },
    },
    sale: {
      recorded: {
        title: 'Confirm input sale #{{saleId}}',
        body: '{{quantity, number}} units, {{amount, taka}}; unconfirmed sales lapse after 7 days',
      },
      confirmed: { title: 'Input sale #{{saleId}} confirmed' },
      cancelled: { title: 'Input sale #{{saleId}} cancelled' },
      expired: { title: 'Input sale #{{saleId}} lapsed unconfirmed' },
      'confirm-due': {
        title: 'Input sale #{{saleId}} lapses soon unless you confirm it',
        body: 'Confirm before {{expiresAt, datetime}}',
      },
    },
    receipt: {
      issued: {
        title: 'Warehouse receipt issued',
        body: '{{quantity, number}} {{produce}} in storage',
      },
      expiring: {
        title:
          'Storage of {{quantity, number}} {{produce}} ends on {{expiresOn, date}}',
        body: 'Re-check and extend the receipt, sell, or collect the goods',
      },
    },
    handover: {
      offered: { title: 'Buy-back offered: accept or decline the receipt' },
      cancelled: { title: 'Buy-back offer withdrawn or declined' },
      accepted: { title: 'WeGro accepted the buy-back' },
    },
    offer: {
      made: {
        title: 'Offer #{{offerId}} awaiting approval',
        body: '{{quantity, number}} at {{unitPrice, taka}} each on listing #{{listingId}}',
      },
      approved: {
        title: 'Your offer was approved',
        body: 'Pay by {{paymentDueAt, datetime}}, or the deal lapses',
      },
      rejected: { title: 'Your offer was rejected' },
    },
    deal: {
      'awaiting-payment': {
        title: 'Deal #{{offerId}}: confirm the buyer’s payment when it arrives',
      },
      'payment-due': {
        title: 'Payment for deal #{{offerId}} is due soon',
        body: '{{amount, taka}} by {{paymentDueAt, datetime}}, or the deal lapses',
      },
      cancelled: { title: 'Your deal was cancelled' },
      expired: { title: 'Your deal lapsed: payment was not confirmed in time' },
      paid: { title: 'Your payment is confirmed' },
      deliver: {
        title:
          'Deal #{{offerId}} is paid: hand over the goods and confirm delivery',
      },
      delivered: {
        title: 'Deal #{{offerId}} delivered',
        body: '{{amount, taka}}',
      },
    },
    claim: {
      opened: { title: 'A claim was opened on a project you cover' },
      approved: {
        title: 'Insurance claim approved: {{amount, taka}}',
        body: '{{project}}',
      },
      rejected: { title: 'Insurance claim rejected', body: '{{project}}' },
    },
    round: {
      prepared: { title: 'Payout round #{{roundId}} needs a second approval' },
      rejected: { title: 'Payout round #{{roundId}} was sent back' },
      approved: {
        title: 'Payout round #{{roundId}} approved: pay and record each line',
      },
    },
    payout: {
      paid: { title: 'You were paid {{amount, taka}}' },
    },
    'track-record': {
      published: {
        title: 'Your track record version {{version, number}} was published',
      },
      viewed: { title: 'Your track record was viewed by {{bank}}' },
    },
    consent: {
      granted: { title: 'You gave permission to {{bank}}' },
      revoked: { title: 'You withdrew permission from {{bank}}' },
      expiring: {
        title: 'Permission for {{bank}} ends soon',
        body: 'It ends at {{expiresAt, datetime}}; renew it if the farmer agrees',
      },
    },
    'bank-account': {
      submitted: { title: 'Bank details awaiting verification' },
      verified: {
        title: 'Your bank details are verified: payouts will go there',
      },
      rejected: {
        title: 'Your new bank details were not accepted',
        body: '{{reason}}',
      },
    },
    system: {
      'node-unreachable': {
        title: 'The blockchain node cannot be reached',
        body: '{{error}}',
      },
      'indexer-behind': {
        title: 'The database is falling behind the ledger',
        body: '{{lag, number}} blocks behind (allowed {{allowed, number}}); pages may show old data',
      },
      'indexer-failing': {
        title: 'Copying ledger events into the database keeps failing',
        body: '{{failures, number}} tries in a row failed: {{error}}',
      },
      resolved: {
        title: 'Resolved: {{problem, word}}',
        body: 'Since {{since, datetime}}',
      },
    },
  } satisfies NotificationWording<NotificationKind>,
  nav: {
    dashboard: 'Dashboard',
    projects: 'Projects',
    myProjects: 'My projects',
    holdings: 'My holdings',
    people: 'People',
    farmers: 'Farmers',
    farmUpdates: 'Farm updates',
    vouchers: 'Vouchers',
    vouchersSales: 'Vouchers & sales',
    batches: 'Batches',
    warehouse: 'Warehouse',
    receipts: 'Receipts',
    marketplace: 'Marketplace',
    offers: 'My offers',
    requests: 'Requests',
    insurance: 'Insurance',
    payouts: 'Payouts',
    statement: 'Statement',
    trackRecords: 'Track records',
    trackRecord: 'Track record',
    catalog: 'Catalog',
    audit: 'History & audit',
    system: 'System',
    sub: {
      allPeople: 'All people',
      myFarmers: 'My farmers',
      pendingPeople: 'Waiting for verification',
      registerPerson: 'Register new',
      registerFarmer: 'Register a farmer',
      detailChanges: 'Details changes',
    },
    status: 'My registration',
    account: 'My account',
    notifications: 'Notifications',
  },
  shell: {
    menu: 'Main menu',
    more: 'More',
    moreTitle: 'More pages',
    account: 'Account',
    signOut: 'Sign out',
    skipToContent: 'Skip to content',
  },
  states: {
    loading: 'Loading…',
    empty: 'Nothing here yet',
    retry: 'Try again',
    reference: 'Reference: {{id}}',
    comingSoon: 'This page is coming soon',
    comingSoonHint:
      'It is being built; the menu already shows where it will be.',
  },
  pages: {
    notFound: 'Page not found',
    notFoundHint: 'The address may be mistyped, or the page has moved.',
    noAccess: 'Not available for your role',
    noAccessHint:
      'This page is for other roles. Your menu shows what you can open.',
    home: 'Go to my home page',
  },
  signIn: {
    title: 'Welcome back',
    intro: 'Sign in to WeGro',
    signInTab: 'Sign in',
    demoTab: 'Demo',
    method: 'Sign in with',
    byEmail: 'Email',
    byPhone: 'Phone',
    phone: 'Mobile number',
    phonePlaceholder: 'Enter your mobile number',
    email: 'Email',
    emailPlaceholder: 'Enter your email address',
    emailRequired: 'Enter your email address.',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    noAccount: 'Don’t have an account?',
    register: 'Register',
    submit: 'Sign in',
    signingIn: 'Signing in…',
    forgot: 'Forgot password?',
    phoneRequired: 'Enter your mobile number.',
    passwordRequired: 'Enter your password.',
    sessionEnded: 'Your session has ended. Please sign in again.',
    demoTitle: 'Demo: choose a role',
    demoHint: 'Each role signs in as a ready-made demo account.',
    demoOff: 'Demo sign-in is not available on this server.',
  },
  signUp: {
    title: 'Create your account',
    step: 'Step {{n, number}} of {{of, number}}',
    roleTitle: 'I want to',
    roleHint: {
      investor: 'Put money into farm projects and follow how they grow.',
      buyer: 'Buy produce on the WeGro marketplace.',
    },
    otherRoles:
      'Farmers are registered by their field officer, and businesses (suppliers, banks, insurers, warehouses) by WeGro.',
    phoneNeeded:
      'We send a 6-digit code to this number by SMS, to confirm it is yours.',
    detailsIntro:
      'As on your national ID card. They are checked, and kept encrypted.',
    create: 'Create account',
    creating: 'Creating your account…',
    next: 'Next',
    back: 'Back',
    haveAccount: 'I have an account',
    emailTitle: 'Confirm your email',
    emailIntro:
      'Your account is ready. Confirm {{email}} to sign in with it too.',
    emailNeeded: 'We email a 6-digit code to this address.',
    emailConfirm: 'Confirm',
    emailLater: 'Later, in My account',
  },
  password: {
    show: 'Show password',
    hide: 'Hide password',
    new: 'New password',
    confirm: 'Type the new password again',
    rule: 'At least {{min, number}} characters.',
    tooShort: 'Use at least {{min, number}} characters.',
    tooLong: 'Use at most {{max, number}} characters.',
    mismatch: 'The two passwords are not the same.',
  },
  forgot: {
    title: 'Reset your password',
    phoneIntro:
      'Enter your mobile number. We will send you a 6-digit code by SMS.',
    send: 'Send code',
    sending: 'Sending…',
    sent: 'If this number has a WeGro account, a 6-digit code is on its way. It works for $t(units.minute, {"count": {{minutes}} }).',
    code: 'Code from the SMS',
    check: 'Continue',
    checking: 'Checking…',
    resendIn: 'You can ask for a new code in {{seconds, number}} seconds.',
    resend: 'Send a new code',
    otherNumber: 'Use a different number',
    codeRequired: 'Enter the 6 digits from the SMS.',
    newIntro: 'Choose a new password. Every other device will be signed out.',
    save: 'Save and sign in',
    saving: 'Saving…',
    back: 'Back to sign in',
  },
  statusPage: {
    pendingTitle: 'Your registration is being checked',
    pendingHint:
      'You can use WeGro once your registration is verified. We will notify you.',
    role: 'Registered as',
  },
  changePassword: {
    title: 'Choose your own password',
    hint: 'You signed in with a temporary password. Choose your own to continue.',
    current: 'Temporary password',
    save: 'Save and continue',
    saving: 'Saving…',
  },
  /** A person's details, wherever they are entered or shown. */
  person: {
    fullName: 'Full name',
    phone: 'Mobile number',
    nid: 'NID number',
    nidHint: 'As on the card: 10 digits, or 13 or 17 on an old NID.',
    dateOfBirth: 'Date of birth',
    district: 'District',
    address: 'Address',
    email: 'Email',
    emailHint: 'Optional. Once confirmed, you can sign in with it too.',
    chooseDistrict: 'Choose a district',
    required: 'Fill this in.',
  },
  /** A 6-digit code confirming a number or an email address. */
  phoneCode: {
    send: 'Send code',
    sending: 'Sending…',
    sent: 'A code is on its way to {{to}}. It works for $t(units.minute, {"count": {{minutes}} }).',
    sentEmail:
      'A code is on its way to {{to}}. It works for $t(units.minute, {"count": {{minutes}} }). Look in spam too.',
    code: 'Code from the SMS',
    codeEmail: 'Code from the email',
    missing: 'Send a code first, then enter it here.',
    malformed: 'Enter the 6 digits of the code.',
    resendIn: 'You can ask for a new code in {{seconds, number}} seconds.',
    resend: 'Send a new code',
  },
  /** The practice ID check: each rule, and why it passed, warned or failed. */
  idCheck: {
    rule: {
      NAME: 'Name',
      PHONE_FORMAT: 'Mobile number',
      DATE_OF_BIRTH: 'Date of birth',
      AGE: 'Age',
      DISTRICT: 'District',
      ADDRESS: 'Address',
      NID_FORMAT: 'NID',
      NID_BIRTH_YEAR: 'NID birth year',
      NID_DISTRICT: 'NID district',
    },
    reason: {
      NAME_OK: 'Well formed.',
      NAME_LENGTH:
        'The name must be {{min, number}} to {{max, number}} characters.',
      NAME_CHARACTERS:
        'The name may contain only letters, spaces, dots, hyphens and apostrophes.',
      PHONE_OK: 'A Bangladeshi mobile number.',
      PHONE_FORMAT: 'Enter a Bangladeshi mobile number: 01 and 9 more digits.',
      DATE_OF_BIRTH_INVALID: 'Enter a real date of birth.',
      DATE_OF_BIRTH_FUTURE: 'The date of birth is in the future.',
      AGE_OK: 'At least {{min, number}} years old.',
      AGE_UNDER: 'Must be at least {{min, number}} years old.',
      AGE_OVER: 'An age over {{max, number}} years is not plausible.',
      DISTRICT_OK: 'A known district.',
      DISTRICT_UNKNOWN: 'Choose one of the 64 districts.',
      ADDRESS_OK: 'Given.',
      ADDRESS_LENGTH:
        'The address must be {{min, number}} to {{max, number}} characters.',
      ADDRESS_CONTROL: 'The address has characters that cannot be used.',
      NID_OK: 'A {{digits, number}}-digit NID.',
      NID_DIGITS: 'The NID may contain only digits.',
      NID_LENGTH: 'The NID must have 10 (smart card), 13 or 17 digits.',
      NID_PLACEHOLDER: 'This is a placeholder pattern, not a real NID.',
      NID_BIRTH_YEAR_OK: 'Matches the date of birth.',
      NID_BIRTH_YEAR_UNCHECKED:
        'Needs a valid date of birth to compare with the NID.',
      NID_BIRTH_YEAR_MISMATCH:
        'The first 4 digits of a 17-digit NID must be the birth year.',
      NID_DISTRICT_OK: 'A valid district code.',
      NID_DISTRICT_UNKNOWN:
        'The NID does not begin with a known district code.',
      NID_DISTRICT_DIFFERENT:
        'Issued in {{issued}}, not {{given}}. This happens when someone lives away from home.',
    } satisfies Record<IdCheckReason, string>,
    passed: 'Passed',
    warned: 'Check this',
    failed: 'Not valid',
  },
  people: {
    register: 'Register someone',
    pendingIntro: 'Registrations waiting for you to check and verify.',
    none: 'Nobody registered yet.',
    noneWaiting: 'Nobody is waiting for verification.',
    noMatch: 'Nobody matches',
    noMatchHint: 'Check the number or NID, or clear the filters.',
    search: 'Full mobile number or NID',
    find: 'Find',
    clearSearch: 'Clear the search',
    role: 'Role',
    anyRole: 'All roles',
    statusLabel: 'Status',
    anyStatus: 'Any status',
    anyDistrict: 'All districts',
    status: { pending: 'Pending', verified: 'Verified', rejected: 'Rejected' },
    column: { person: 'Person', registered: 'Registered' },
    pages: 'Pages',
    pageOf:
      'Page {{page, number}} of {{pages, number}}, {{count, number}} in all',
    previous: 'Previous',
    next: 'Next',
    flagged: 'Flagged',
    ledgerPending: 'Ledger confirming',
    rejectedBecause: 'Not accepted',
    ledgerPendingTitle: 'The ledger has not confirmed this registration yet',
    ledgerPendingText:
      'It is confirmed on its own. If it stays like this, sync it with the ledger.',
    details: 'Details',
    masked: 'Partly hidden: auditors see only what they need.',
    idCheck: 'ID check',
    idCheckFlagged:
      'Passed with warnings: whoever verifies them acknowledges these.',
    idCheckPassed: 'Every rule passed.',
    idCheckNone: 'No ID check was recorded.',
    registration: 'Registration',
    registeredOn: 'Registered',
    registeredBy: 'Registered by',
    selfRegistered: 'Signed up themselves',
    fieldOfficer: 'Field officer',
    noOfficer: 'None assigned yet',
    statusChanged: 'Status last changed',
    ledger: 'Ledger',
    ledgerIntro:
      'Their record on the WeGro ledger, and whether the stored details still match its fingerprint.',
    integrity: {
      check: 'Check against the ledger',
      checking: 'Checking…',
      matches: 'The stored details match the ledger.',
      differs: 'The record does not match the ledger',
      what: {
        decryption: 'the stored details cannot be read',
        storedHash: 'the stored fingerprint',
        notOnLedger: 'not on the ledger',
        ledgerHash: 'the details fingerprint',
        role: 'the role',
        status: 'the status',
        account: 'the ledger account',
      },
    },
    password: {
      title: 'Temporary password',
      copy: 'Copy',
      copied: 'Copied.',
      sent: 'It was also sent to them by SMS.',
      notSent: 'The SMS could not be sent',
      handOver: 'Give them this password in person.',
      once: 'It is shown only now. They choose their own the first time they sign in.',
    },
    actions: {
      verify: 'Verify',
      reject: 'Reject',
      more: 'More',
      assign: 'Assign field officer',
      reset: 'Reset password',
      replaceKey: 'Replace key',
      sync: 'Sync with ledger',
      synced: 'In line with the ledger.',
      cancel: 'Cancel',
      working: 'Working…',
      done: 'Done',
      verified: '{{name}} is verified.',
      verifyTitle: 'Verify {{name}}?',
      verifyText: 'They get their role on the ledger and can use WeGro.',
      acknowledge: 'I have reviewed the warnings.',
      acknowledgeFirst: 'Tick the box to confirm you reviewed the warnings.',
      rejected: '{{name}} is rejected.',
      rejectTitle: 'Reject {{name}}?',
      rejectText:
        'They will not be able to use WeGro. Say why; they can still be verified later.',
      rejectVerifiedText:
        'Their role is taken back on the ledger and they are signed out. Say why.',
      reason: 'Reason',
      reasonShort: 'Write at least {{min, number}} characters.',
      resetTitle: 'Reset the password of {{name}}?',
      resetText:
        'A temporary password is made and sent to them by SMS; their sessions end on every device.',
      keyReplaced: 'The key is replaced on the ledger.',
      replaceKeyTitle: 'Replace the key of {{name}}?',
      replaceKeyText:
        'A new signing key is made and registered on the ledger, and the old one stops working. Use this when a key may be lost or leaked.',
      assigned: 'Field officer assigned.',
      assignTitle: 'Field officer of {{name}}',
      assignNow: 'Now: {{name}}.',
      assignNone: 'No field officer yet.',
      chooseOfficer: 'Choose a field officer',
    },
    new: {
      intro:
        'Choose the role, enter the details as on the NID, and check them before registering.',
      whichRole: 'They will be',
      detailsIntro:
        'Details of the new {{role}}, as on their national ID card.',
      language: 'Language for their SMS and the app',
      languageHint: 'Their temporary password is sent in it.',
      check: 'Check details',
      checking: 'Checking…',
      fix: 'Fix the details',
      edit: 'Change the details',
      register: 'Register {{role}}',
      registering: 'Registering…',
      registered: '{{name}} is registered as {{role}}.',
      ledgerPending:
        'The ledger is still confirming the registration; it completes on its own.',
      next: 'Next, verify them from their page.',
      nextOfficer: 'An admin verifies them next. They are assigned to you.',
      open: 'Open their page',
      another: 'Register another',
      cannot: 'This cannot be registered as it is',
      cannotText: 'Fix what failed below.',
      flagged: 'Can be registered, with warnings',
      flaggedText: 'Whoever verifies them acknowledges these warnings.',
      passed: 'Ready to register',
      passedText: 'Every rule passed, and the number and NID are free.',
    },
  },
  changes: {
    intro:
      'People asking to change their own details. Approving puts the new details on the ledger.',
    show: 'Show',
    status: {
      pending: 'Waiting',
      approved: 'Approved',
      rejected: 'Rejected',
      withdrawn: 'Taken back',
    },
    none: {
      pending: 'No changes are waiting.',
      approved: 'No approved changes yet.',
      rejected: 'No rejected changes.',
    },
    sent: 'sent {{at}}',
    openPerson: 'Open their page',
    compare: 'What changes',
    compareIntro: 'Their details now, and as they asked.',
    now: 'Now',
    asked: 'Asked for',
    changes: 'changes',
    flagged: 'Warnings on the new details: acknowledge them to approve.',
    decided: {
      approved: 'Approved by {{name}}, {{at}}',
      rejected: 'Rejected by {{name}}, {{at}}',
      withdrawn: 'Taken back by them',
    },
    decide: 'Decision',
    decideIntro:
      'Check the new details against their documents before approving.',
    approve: 'Approve',
    reject: 'Reject',
    rejectConfirm: 'Reject with this reason',
    reason: 'Why (they will read this)',
    approvedToast: 'Approved: the new details are on the ledger.',
    rejectedToast: 'Rejected: they are told why.',
  },
  account: {
    title: 'My account',
    details: {
      title: 'My details',
      byAdmin: 'An admin checks a change before it applies.',
      bySuperAdmin: 'The super admin checks a change before it applies.',
      atOnce: 'Your changes apply at once.',
      edit: 'Change my details',
      editAgain: 'Change again',
      cancel: 'Cancel',
      submit: 'Send for approval',
      submitNow: 'Save',
      submitting: 'Sending…',
      replaces: 'Sending a new change replaces the one waiting.',
      sent: 'Your change is sent. You will be notified when it is decided.',
      saved: 'Your details are saved.',
      pending: 'Waiting for approval since {{at, datetime}}',
      approved: 'Your last change was approved on {{at, date}}.',
      rejected: 'Your last change was not approved ({{at, date}}).',
      reason: 'Reason: {{reason}}',
      newValues: 'Asked for',
      withdraw: 'Take it back',
      withdrawing: 'Taking back…',
      withdrawn: 'Your change is taken back.',
    },
    phoneNeeded: 'Confirm the new number: we send it a 6-digit code by SMS.',
    language: {
      title: 'Language',
      intro:
        'WeGro, its notifications and its SMS use this language on every device you sign in on.',
    },
    email: {
      title: 'Email',
      intro:
        'Once confirmed, you can sign in with it as well as your number. Optional.',
      none: 'No email address yet',
      add: 'Add an email address',
      change: 'Change it',
      remove: 'Remove',
      new: 'New email address',
      malformed: 'Enter an email address, such as name@example.com.',
      saved: 'Your email address is confirmed. You can sign in with it.',
      removed: 'Your email address is removed.',
    },
    password: {
      title: 'Password',
      intro: 'Changing it signs you out on every other device.',
      current: 'Current password',
      save: 'Change password',
      saving: 'Saving…',
      changed: 'Your password is changed. Other devices are signed out.',
    },
    ledger: {
      title: 'Ledger account',
      intro:
        'The address of your signing key on the WeGro ledger. What you do on the ledger is signed with it.',
      copy: 'Copy address',
      copied: 'Address copied.',
    },
    everywhere: {
      title: 'Sign out everywhere',
      intro: 'Ends your sessions on every phone and computer, this one too.',
      action: 'Sign out everywhere',
      confirmTitle: 'Sign out on every device?',
      confirmText: 'You will need to sign in again on each of them.',
      cancel: 'Cancel',
      working: 'Signing out…',
    },
  },
  pwa: {
    updateReady: 'A new version of WeGro is ready.',
    reload: 'Reload',
    offline:
      'You are offline. Drafts stay on this device and can be sent when you are back online.',
    install: 'Install app',
    installTitle: 'Install WeGro',
    appleIntro: 'Add WeGro to your home screen to open it like an app:',
    appleShare: 'In Safari, tap the Share button.',
    appleAdd: 'Choose “Add to Home Screen”.',
  },
  formats: {
    title: 'Language and formats',
    amount: 'Amount',
    shortAmount: 'Short amount',
    count: 'Count',
    date: 'Date',
    dateTime: 'Date and time',
    relative: 'Relative time',
    error: 'Error',
    notification: 'Notification',
  },
};

/** reservation.made -> { reservation: { made: { title, body? } } } */
type NotificationWording<K extends string> = {
  [A in K extends `${infer G}.${string}` ? G : never]: {
    [B in K extends `${A}.${infer L}` ? L : never]: {
      title: string;
      body?: string;
    };
  };
};

type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

/** What every language must provide: the same keys as English. */
export type Translation = Shape<typeof en>;
