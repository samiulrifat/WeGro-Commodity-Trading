/**
 * Every reason the API gives for refusing a request: the `code` of an error
 * response (and of each entry in `details.problems`). The app words each one
 * in the reader's language from the code and `details`; `message` stays the
 * English wording, shown here with its values in braces.
 *
 * Errors the ledger itself raises keep the contract's error name as their
 * code instead (see LedgerErrorCode in contract-errors.ts). A test checks that
 * every error the backend throws carries one of these, and every one is used.
 */
export enum ErrorCode {
  /** Only a verified person's access can be revoked */
  ACCESS_NOT_ACTIVE = 'ACCESS_NOT_ACTIVE',
  /** Your access to WeGro has been revoked */
  ACCESS_REVOKED = 'ACCESS_REVOKED',
  /** Too many failed sign-in attempts. Try again in {minutes} minutes. */
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  /** Your account is not verified */
  ACCOUNT_NOT_VERIFIED = 'ACCOUNT_NOT_VERIFIED',
  /** This account was not approved */
  ACCOUNT_REJECTED = 'ACCOUNT_REJECTED',
  /** Already assigned to this field officer */
  ALREADY_ASSIGNED = 'ALREADY_ASSIGNED',
  /** This project has already claimed for this event */
  ALREADY_CLAIMED = 'ALREADY_CLAIMED',
  /** This line is already paid */
  ALREADY_PAID = 'ALREADY_PAID',
  /** Already being published */
  ALREADY_PUBLISHING = 'ALREADY_PUBLISHING',
  /** Already refunded */
  ALREADY_REFUNDED = 'ALREADY_REFUNDED',
  /** Already rejected */
  ALREADY_REJECTED = 'ALREADY_REJECTED',
  /** This project is already settled */
  ALREADY_SETTLED = 'ALREADY_SETTLED',
  /** Already verified */
  ALREADY_VERIFIED = 'ALREADY_VERIFIED',
  /** amount must be above zero */
  AMOUNT_NOT_POSITIVE = 'AMOUNT_NOT_POSITIVE',
  /** Auditors have read-only access */
  AUDITOR_READ_ONLY = 'AUDITOR_READ_ONLY',
  /** Phone number, email or password is incorrect */
  BAD_CREDENTIALS = 'BAD_CREDENTIALS',
  /** No branch has routing number {routingNumber} */
  BANK_BRANCH_NOT_FOUND = 'BANK_BRANCH_NOT_FOUND',
  /** These details are already verified */
  BANK_DETAILS_ALREADY_VERIFIED = 'BANK_DETAILS_ALREADY_VERIFIED',
  /** This bank branch is already registered */
  BANK_EXISTS = 'BANK_EXISTS',
  /** {entry}: district {districtCode} is {name} here but {expected} elsewhere */
  BANK_LIST_DISTRICT_MISMATCH = 'BANK_LIST_DISTRICT_MISMATCH',
  /** {entry}: district {districtCode} is not in the districts file */
  BANK_LIST_DISTRICT_UNKNOWN = 'BANK_LIST_DISTRICT_UNKNOWN',
  /** {file}: {value} appears more than once */
  BANK_LIST_DUPLICATE = 'BANK_LIST_DUPLICATE',
  /** The bank list has no branches */
  BANK_LIST_EMPTY = 'BANK_LIST_EMPTY',
  /** {file}, {entry}: {field} is missing or wrong */
  BANK_LIST_ENTRY_INVALID = 'BANK_LIST_ENTRY_INVALID',
  /** Send the branches file as the "branches" field */
  BANK_LIST_FILE_MISSING = 'BANK_LIST_FILE_MISSING',
  /** The bank list has problems; nothing was changed */
  BANK_LIST_INVALID = 'BANK_LIST_INVALID',
  /** ... and {count} more */
  BANK_LIST_MORE_PROBLEMS = 'BANK_LIST_MORE_PROBLEMS',
  /** {file} must be JSON with a "{key}" list */
  BANK_LIST_UNREADABLE = 'BANK_LIST_UNREADABLE',
  /** Bank not found */
  BANK_NOT_FOUND = 'BANK_NOT_FOUND',
  /** Only a verified bank officer can be assigned */
  BANK_OFFICER_INVALID = 'BANK_OFFICER_INVALID',
  /** {batch}: expired */
  BATCH_EXPIRED = 'BATCH_EXPIRED',
  /** Batch not found */
  BATCH_NOT_FOUND = 'BATCH_NOT_FOUND',
  /** {batch}: not registered yet */
  BATCH_NOT_REGISTERED = 'BATCH_NOT_REGISTERED',
  /** {batch}: not one of your batches */
  BATCH_NOT_YOURS = 'BATCH_NOT_YOURS',
  /** {batch}: a batch of {input}, not {expected} */
  BATCH_WRONG_INPUT = 'BATCH_WRONG_INPUT',
  /** Money was sent for this booking: ask WeGro to cancel it, and it is refunded */
  BOOKING_HAS_PAYMENTS = 'BOOKING_HAS_PAYMENTS',
  /** An entry with this code already exists */
  CATALOG_CODE_EXISTS = 'CATALOG_CODE_EXISTS',
  /** The entry {code} is no longer in use */
  CATALOG_CODE_RETIRED = 'CATALOG_CODE_RETIRED',
  /** Unknown code {code} */
  CATALOG_CODE_UNKNOWN = 'CATALOG_CODE_UNKNOWN',
  /** No entry {code} */
  CATALOG_ENTRY_NOT_FOUND = 'CATALOG_ENTRY_NOT_FOUND',
  /** An entry with this name already exists */
  CATALOG_NAME_EXISTS = 'CATALOG_NAME_EXISTS',
  /** A referenced code does not exist */
  CATALOG_REFERENCE_UNKNOWN = 'CATALOG_REFERENCE_UNKNOWN',
  /** This changed meanwhile; try again */
  CHANGED_MEANWHILE = 'CHANGED_MEANWHILE',
  /** Details change not found */
  CHANGE_NOT_FOUND = 'CHANGE_NOT_FOUND',
  /** This details change is {status} */
  CHANGE_NOT_PENDING = 'CHANGE_NOT_PENDING',
  /** Someone else must review your own details change */
  CHANGE_OWN_REQUEST = 'CHANGE_OWN_REQUEST',
  /** checkedOn cannot be in the future */
  CHECK_IN_FUTURE = 'CHECK_IN_FUTURE',
  /** No assessment photo for this claim */
  CLAIM_HAS_NO_PHOTO = 'CLAIM_HAS_NO_PHOTO',
  /** Only the farmer's field officer or an admin can claim */
  CLAIM_NOT_ALLOWED = 'CLAIM_NOT_ALLOWED',
  /** Claim not found */
  CLAIM_NOT_FOUND = 'CLAIM_NOT_FOUND',
  /** No such photo on this claim */
  CLAIM_PHOTO_NOT_FOUND = 'CLAIM_PHOTO_NOT_FOUND',
  /** This claim is {status} */
  CLAIM_WRONG_STATUS = 'CLAIM_WRONG_STATUS',
  /** This code has expired (or had too many wrong tries). Ask for a new one. */
  CODE_EXPIRED = 'CODE_EXPIRED',
  /** Too many codes for this number or address. Try again in {minutes} minutes. */
  CODE_TOO_MANY = 'CODE_TOO_MANY',
  /** Wait {seconds} seconds before asking for another code */
  CODE_WAIT = 'CODE_WAIT',
  /** That code is not right. {attemptsLeft} tries left. */
  CODE_WRONG = 'CODE_WRONG',
  /** Not possible in the current state */
  CONFLICT = 'CONFLICT',
  /** Consent not found */
  CONSENT_NOT_FOUND = 'CONSENT_NOT_FOUND',
  /** Coordinates must be decimal degrees with at most 6 decimal places */
  COORDINATES_INVALID = 'COORDINATES_INVALID',
  /** Corrections in this batch refer to each other in a circle */
  CORRECTION_CYCLE = 'CORRECTION_CYCLE',
  /** correctsEntryId must be a record of the same project */
  CORRECTION_OTHER_PROJECT = 'CORRECTION_OTHER_PROJECT',
  /** This cost is already voided */
  COST_ALREADY_VOIDED = 'COST_ALREADY_VOIDED',
  /** No bill photo for this cost */
  COST_HAS_NO_PHOTO = 'COST_HAS_NO_PHOTO',
  /** Cost not found */
  COST_NOT_FOUND = 'COST_NOT_FOUND',
  /** Costs are entered while a project is funded, active or ready for sale; this one is {stage} */
  COST_PROJECT_STAGE = 'COST_PROJECT_STAGE',
  /** Claims of {approvedTotal} taka are already approved; the cover cannot be less */
  COVERAGE_BELOW_APPROVED = 'COVERAGE_BELOW_APPROVED',
  /** These are already the current terms */
  COVER_UNCHANGED = 'COVER_UNCHANGED',
  /** damagePercent must be above 0 */
  DAMAGE_NOT_POSITIVE = 'DAMAGE_NOT_POSITIVE',
  /** Database unavailable */
  DATABASE_UNAVAILABLE = 'DATABASE_UNAVAILABLE',
  /** {unpaidDeals} approved deal(s) are waiting for payment */
  DEALS_PENDING = 'DEALS_PENDING',
  /** This deal is already being confirmed */
  DEAL_CONFIRMING = 'DEAL_CONFIRMING',
  /** The {side} has already confirmed this delivery */
  DELIVERY_ALREADY_CONFIRMED = 'DELIVERY_ALREADY_CONFIRMED',
  /** Only the buyer or the handler confirms delivery */
  DELIVERY_CONFIRM_NOT_ALLOWED = 'DELIVERY_CONFIRM_NOT_ALLOWED',
  /** No photo for this delivery */
  DELIVERY_HAS_NO_PHOTO = 'DELIVERY_HAS_NO_PHOTO',
  /** Stored details do not match the ledger; cannot verify */
  DETAILS_MISMATCH = 'DETAILS_MISMATCH',
  /** Nothing in these details is different from the current ones */
  DETAILS_UNCHANGED = 'DETAILS_UNCHANGED',
  /** This draft was never published: delete it instead */
  DRAFT_NEVER_PUBLISHED = 'DRAFT_NEVER_PUBLISHED',
  /** The same id appears twice in this batch */
  DUPLICATE_IN_BATCH = 'DUPLICATE_IN_BATCH',
  /** This email address is already in use */
  EMAIL_ALREADY_REGISTERED = 'EMAIL_ALREADY_REGISTERED',
  /** There is no email address on this account */
  EMAIL_NOT_SET = 'EMAIL_NOT_SET',
  /** This is already your email address */
  EMAIL_UNCHANGED = 'EMAIL_UNCHANGED',
  /** This id was already used for a different record */
  ENTRY_ID_REUSED = 'ENTRY_ID_REUSED',
  /** The cover does not include this kind of event (see coveredEventTypes) */
  EVENT_NOT_COVERED = 'EVENT_NOT_COVERED',
  /** Only {available} still available */
  EXCEEDS_AVAILABLE = 'EXCEEDS_AVAILABLE',
  /** Only {remaining} taka of the cover remains */
  EXCEEDS_COVERAGE = 'EXCEEDS_COVERAGE',
  /** The voucher is worth more than the funding left for inputs */
  EXCEEDS_FUNDING_TARGET = 'EXCEEDS_FUNDING_TARGET',
  /** Only {available} left on this voucher */
  EXCEEDS_VOUCHER_QUANTITY = 'EXCEEDS_VOUCHER_QUANTITY',
  /** expiresOn cannot be before intakeDate */
  EXPIRES_BEFORE_INTAKE = 'EXPIRES_BEFORE_INTAKE',
  /** expiresOn cannot be before producedOn */
  EXPIRES_BEFORE_PRODUCED = 'EXPIRES_BEFORE_PRODUCED',
  /** The expiry date cannot be in the past */
  EXPIRY_IN_PAST = 'EXPIRY_IN_PAST',
  /** Permission lasts at most a year; renew it when it ends */
  EXPIRY_TOO_LATE = 'EXPIRY_TOO_LATE',
  /** Farmer not found */
  FARMER_NOT_FOUND = 'FARMER_NOT_FOUND',
  /** Farm updates are recorded from funding until the produce is ready for sale */
  FARM_UPDATE_WRONG_STAGE = 'FARM_UPDATE_WRONG_STAGE',
  /** Field officers register farmers only */
  FIELD_OFFICER_FARMERS_ONLY = 'FIELD_OFFICER_FARMERS_ONLY',
  /** This field officer looks after {count} farmers: choose the field officer they move to */
  FIELD_OFFICER_HAS_FARMERS = 'FIELD_OFFICER_HAS_FARMERS',
  /** officerId must be a verified field officer */
  FIELD_OFFICER_INVALID = 'FIELD_OFFICER_INVALID',
  /** Field record not found */
  FIELD_RECORD_NOT_FOUND = 'FIELD_RECORD_NOT_FOUND',
  /** A final round is open; reject it to change costs */
  FINAL_ROUND_OPEN = 'FINAL_ROUND_OPEN',
  /** Not allowed */
  FORBIDDEN = 'FORBIDDEN',
  /** You cannot cancel this handover */
  HANDOVER_CANCEL_NOT_ALLOWED = 'HANDOVER_CANCEL_NOT_ALLOWED',
  /** The ID check failed */
  ID_CHECK_FAILED = 'ID_CHECK_FAILED',
  /** The ID check flagged this person; review the flags and confirm with acknowledgeFlags */
  ID_CHECK_FLAGS_NOT_ACKNOWLEDGED = 'ID_CHECK_FLAGS_NOT_ACKNOWLEDGED',
  /** incurredOn cannot be in the future */
  INCURRED_IN_FUTURE = 'INCURRED_IN_FUTURE',
  /** Insurance applies while the crop is in the field (funded or active); this project is {stage} */
  INSURANCE_PROJECT_STAGE = 'INSURANCE_PROJECT_STAGE',
  /** intakeDate cannot be in the future */
  INTAKE_IN_FUTURE = 'INTAKE_IN_FUTURE',
  /** Some batches cannot be used for this sale */
  INVALID_BATCHES = 'INVALID_BATCHES',
  /** Some details are not valid */
  INVALID_DETAILS = 'INVALID_DETAILS',
  /** Some values are missing or not valid (see details.fields) */
  INVALID_INPUT = 'INVALID_INPUT',
  /** The record is not valid */
  INVALID_RECORD = 'INVALID_RECORD',
  /** The request could not be read */
  INVALID_REQUEST = 'INVALID_REQUEST',
  /** The project terms are not valid */
  INVALID_TERMS = 'INVALID_TERMS',
  /** No job named {job} */
  JOB_NOT_FOUND = 'JOB_NOT_FOUND',
  /** {job} is running; try again when it finishes */
  JOB_RUNNING = 'JOB_RUNNING',
  /** A key replacement is already in progress */
  KEY_REPLACEMENT_PENDING = 'KEY_REPLACEMENT_PENDING',
  /** Blockchain transaction failed */
  LEDGER_FAILED = 'LEDGER_FAILED',
  /** The ledger record does not match this person */
  LEDGER_MISMATCH = 'LEDGER_MISMATCH',
  /** Blockchain node unavailable */
  LEDGER_UNAVAILABLE = 'LEDGER_UNAVAILABLE',
  /** The amount for this line does not match the ledger */
  LINE_NOT_VERIFIED = 'LINE_NOT_VERIFIED',
  /** Only the seller side or an admin can cancel this listing */
  LISTING_CANCEL_NOT_ALLOWED = 'LISTING_CANCEL_NOT_ALLOWED',
  /** Only an admin or the farmer's field officer can list this */
  LISTING_NOT_ALLOWED = 'LISTING_NOT_ALLOWED',
  /** Listing not found */
  LISTING_NOT_FOUND = 'LISTING_NOT_FOUND',
  /** This listing is {status} */
  LISTING_WRONG_STATUS = 'LISTING_WRONG_STATUS',
  /** Give both latitude and longitude, or neither */
  LOCATION_INCOMPLETE = 'LOCATION_INCOMPLETE',
  /** The location is outside Bangladesh */
  LOCATION_OUTSIDE_BANGLADESH = 'LOCATION_OUTSIDE_BANGLADESH',
  /** A {recordType} needs the location */
  LOCATION_REQUIRED = 'LOCATION_REQUIRED',
  /** You already registered this lot number for this input */
  LOT_ALREADY_REGISTERED = 'LOT_ALREADY_REGISTERED',
  /** {key}: above the maximum {max} */
  MEASUREMENT_ABOVE_MAX = 'MEASUREMENT_ABOVE_MAX',
  /** {key}: below the minimum {min} */
  MEASUREMENT_BELOW_MIN = 'MEASUREMENT_BELOW_MIN',
  /** Measurement {key}: bound {bound} has more than {decimals} decimal places */
  MEASUREMENT_BOUND_DECIMALS = 'MEASUREMENT_BOUND_DECIMALS',
  /** Measurement key {key} is used twice */
  MEASUREMENT_KEY_REPEATED = 'MEASUREMENT_KEY_REPEATED',
  /** {key}: must be a number with at most {decimals} decimal places */
  MEASUREMENT_NOT_A_NUMBER = 'MEASUREMENT_NOT_A_NUMBER',
  /** Measurement {key}: min is above max */
  MEASUREMENT_RANGE_INVALID = 'MEASUREMENT_RANGE_INVALID',
  /** {key}: required */
  MEASUREMENT_REQUIRED = 'MEASUREMENT_REQUIRED',
  /** {key}: not a measurement of this record type */
  MEASUREMENT_UNKNOWN = 'MEASUREMENT_UNKNOWN',
  /** newExpiresOn must be later than the current expiry */
  NEW_EXPIRY_NOT_LATER = 'NEW_EXPIRY_NOT_LATER',
  /** A person with this NID is already registered */
  NID_ALREADY_REGISTERED = 'NID_ALREADY_REGISTERED',
  /** There is no new profit to split */
  NOTHING_TO_DISTRIBUTE = 'NOTHING_TO_DISTRIBUTE',
  /** Notification not found */
  NOTIFICATION_NOT_FOUND = 'NOTIFICATION_NOT_FOUND',
  /** You are not assigned to a bank */
  NOT_ASSIGNED_TO_BANK = 'NOT_ASSIGNED_TO_BANK',
  /** Only farmers have a field officer */
  NOT_A_FARMER = 'NOT_A_FARMER',
  /** Only farmers and investors receive payouts */
  NOT_A_PAYEE = 'NOT_A_PAYEE',
  /** Not confirmed by the ledger yet; keep the draft and send it again later */
  NOT_CONFIRMED = 'NOT_CONFIRMED',
  /** Only {available} slots are available */
  NOT_ENOUGH_SLOTS = 'NOT_ENOUGH_SLOTS',
  /** Only the farmer's field officer can do this */
  NOT_FARMERS_OFFICER = 'NOT_FARMERS_OFFICER',
  /** Not found */
  NOT_FOUND = 'NOT_FOUND',
  /** This project is not insured */
  NOT_INSURED = 'NOT_INSURED',
  /** This person is not paid in this round */
  NOT_IN_ROUND = 'NOT_IN_ROUND',
  /** Only an operator of the issuing site can do this */
  NOT_ISSUING_SITE_OPERATOR = 'NOT_ISSUING_SITE_OPERATOR',
  /** Stored crops and spices are sold through their warehouse receipts */
  NOT_PERISHABLE = 'NOT_PERISHABLE',
  /** Only the project's insurer can review this claim */
  NOT_PROJECT_INSURER = 'NOT_PROJECT_INSURER',
  /** Only the receipt owner's side can list it */
  NOT_RECEIPT_OWNER = 'NOT_RECEIPT_OWNER',
  /** You are not assigned to a warehouse site */
  NOT_SITE_OPERATOR = 'NOT_SITE_OPERATOR',
  /** This project pays out only once, at the end */
  NOT_STAGED = 'NOT_STAGED',
  /** Fresh produce is sold directly, not stored */
  NOT_STORABLE = 'NOT_STORABLE',
  /** This farmer has not given your bank permission */
  NO_ACTIVE_CONSENT = 'NO_ACTIVE_CONSENT',
  /** This bank has no current permission to withdraw */
  NO_CONSENT_TO_WITHDRAW = 'NO_CONSENT_TO_WITHDRAW',
  /** No insurer covers this project yet */
  NO_COVERAGE = 'NO_COVERAGE',
  /** No demo account for role {role} yet */
  NO_DEMO_ACCOUNT = 'NO_DEMO_ACCOUNT',
  /** No details waiting */
  NO_DETAILS_WAITING = 'NO_DETAILS_WAITING',
  /** No fingerprint stored */
  NO_FINGERPRINT = 'NO_FINGERPRINT',
  /** The farmer has no finished projects yet */
  NO_FINISHED_PROJECTS = 'NO_FINISHED_PROJECTS',
  /** No handover is waiting on this receipt */
  NO_HANDOVER_WAITING = 'NO_HANDOVER_WAITING',
  /** This investor holds no slots in the project */
  NO_SLOTS_HELD = 'NO_SLOTS_HELD',
  /** No statement for this participant */
  NO_STATEMENT = 'NO_STATEMENT',
  /** This farmer has no track record yet */
  NO_TRACK_RECORD = 'NO_TRACK_RECORD',
  /** observedAt is in the future: check the phone's clock */
  OBSERVED_AT_FUTURE = 'OBSERVED_AT_FUTURE',
  /** observedAt is not a valid time */
  OBSERVED_AT_INVALID = 'OBSERVED_AT_INVALID',
  /** occurredOn cannot be in the future */
  OCCURRED_IN_FUTURE = 'OCCURRED_IN_FUTURE',
  /** Offer not found */
  OFFER_NOT_FOUND = 'OFFER_NOT_FOUND',
  /** This offer is {status} */
  OFFER_WRONG_STATUS = 'OFFER_WRONG_STATUS',
  /** Another insurer covers this project */
  OTHER_INSURER = 'OTHER_INSURER',
  /** Only admins manage participants */
  PARTICIPANTS_MANAGED_BY_ADMINS = 'PARTICIPANTS_MANAGED_BY_ADMINS',
  /** Participant not found */
  PARTICIPANT_NOT_FOUND = 'PARTICIPANT_NOT_FOUND',
  /** The registration is not confirmed on the ledger yet */
  PARTICIPANT_UNCONFIRMED = 'PARTICIPANT_UNCONFIRMED',
  /** Change your temporary password first */
  PASSWORD_CHANGE_REQUIRED = 'PASSWORD_CHANGE_REQUIRED',
  /** New password must differ from the current one */
  PASSWORD_UNCHANGED = 'PASSWORD_UNCHANGED',
  /** This account is already listed */
  PAYMENT_ACCOUNT_EXISTS = 'PAYMENT_ACCOUNT_EXISTS',
  /** Payment account not found */
  PAYMENT_ACCOUNT_NOT_FOUND = 'PAYMENT_ACCOUNT_NOT_FOUND',
  /** A different payment for this line is being recorded */
  PAYMENT_IN_PROGRESS = 'PAYMENT_IN_PROGRESS',
  /** The payment deadline for this deal has passed */
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE',
  /** This payment reference was already used */
  PAYMENT_REF_ALREADY_USED = 'PAYMENT_REF_ALREADY_USED',
  /** A payment reference must be 1-128 characters */
  PAYMENT_REF_INVALID = 'PAYMENT_REF_INVALID',
  /** to must not be before from */
  PERIOD_REVERSED = 'PERIOD_REVERSED',
  /** A period is at most {maxDays} days */
  PERIOD_TOO_LONG = 'PERIOD_TOO_LONG',
  /** This phone number is already registered */
  PHONE_ALREADY_REGISTERED = 'PHONE_ALREADY_REGISTERED',
  /** Enter a Bangladeshi mobile number */
  PHONE_INVALID = 'PHONE_INVALID',
  /** Confirm the new number with the code sent to it */
  PHONE_NOT_CONFIRMED = 'PHONE_NOT_CONFIRMED',
  /** This is already your number */
  PHONE_UNCHANGED = 'PHONE_UNCHANGED',
  /** The image file is damaged */
  PHOTO_DAMAGED = 'PHOTO_DAMAGED',
  /** Send the photo as the "file" field */
  PHOTO_FIELD_MISSING = 'PHOTO_FIELD_MISSING',
  /** The photo file is missing */
  PHOTO_FILE_MISSING = 'PHOTO_FILE_MISSING',
  /** Photo not found */
  PHOTO_NOT_FOUND = 'PHOTO_NOT_FOUND',
  /** The photo must be one you uploaded */
  PHOTO_NOT_YOURS = 'PHOTO_NOT_YOURS',
  /** A {recordType} needs a photo */
  PHOTO_REQUIRED = 'PHOTO_REQUIRED',
  /** A photo must be 1 byte to {maxMb} MB */
  PHOTO_SIZE = 'PHOTO_SIZE',
  /** Photos must be JPEG, PNG or WebP */
  PHOTO_TYPE = 'PHOTO_TYPE',
  /** producedOn cannot be in the future */
  PRODUCED_IN_FUTURE = 'PRODUCED_IN_FUTURE',
  /** This is done only while the project is active */
  PROJECT_NOT_ACTIVE = 'PROJECT_NOT_ACTIVE',
  /** Project not found */
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  /** This project is not open for funding */
  PROJECT_NOT_OPEN = 'PROJECT_NOT_OPEN',
  /** Publish the project first */
  PROJECT_NOT_PUBLISHED = 'PROJECT_NOT_PUBLISHED',
  /** Published projects cannot be changed or deleted */
  PROJECT_PUBLISHED_LOCKED = 'PROJECT_PUBLISHED_LOCKED',
  /** This booking has payment proofs: review them instead */
  PROOFS_TO_REVIEW = 'PROOFS_TO_REVIEW',
  /** This proof is already {status} */
  PROOF_ALREADY_DECIDED = 'PROOF_ALREADY_DECIDED',
  /** The amount must be above zero and at most {remaining}, what is left to pay */
  PROOF_AMOUNT_INVALID = 'PROOF_AMOUNT_INVALID',
  /** Choose the bank the money was paid from */
  PROOF_BANK_REQUIRED = 'PROOF_BANK_REQUIRED',
  /** The transfer date cannot be in the future */
  PROOF_DATE_FUTURE = 'PROOF_DATE_FUTURE',
  /** Attach 1 to {max} files */
  PROOF_FILE_COUNT = 'PROOF_FILE_COUNT',
  /** The file is missing */
  PROOF_FILE_MISSING = 'PROOF_FILE_MISSING',
  /** Each file must be 1 byte to {maxMb} MB */
  PROOF_FILE_SIZE = 'PROOF_FILE_SIZE',
  /** Proofs must be photos (JPEG, PNG, WebP) or PDFs */
  PROOF_FILE_TYPE = 'PROOF_FILE_TYPE',
  /** Payment proof not found */
  PROOF_NOT_FOUND = 'PROOF_NOT_FOUND',
  /** Only money accepted for a booking that ended unconfirmed is refunded */
  PROOF_NOT_REFUNDABLE = 'PROOF_NOT_REFUNDABLE',
  /** Saved on the ledger, but the database copy could not be updated yet; it will be retried automatically. Do not repeat the action. */
  READ_MODEL_UPDATE_FAILED = 'READ_MODEL_UPDATE_FAILED',
  /** This receipt has expired; the site must re-check and extend it first */
  RECEIPT_EXPIRED = 'RECEIPT_EXPIRED',
  /** Receipt not found */
  RECEIPT_NOT_FOUND = 'RECEIPT_NOT_FOUND',
  /** Only an issued receipt can be used for this; this one is {status} */
  RECEIPT_NOT_ISSUED = 'RECEIPT_NOT_ISSUED',
  /** This receipt is {status} */
  RECEIPT_WRONG_STATUS = 'RECEIPT_WRONG_STATUS',
  /** This record has no photo */
  RECORD_HAS_NO_PHOTO = 'RECORD_HAS_NO_PHOTO',
  /** Record not found */
  RECORD_NOT_FOUND = 'RECORD_NOT_FOUND',
  /** A different refund for this investor is being recorded */
  REFUND_IN_PROGRESS = 'REFUND_IN_PROGRESS',
  /** Refunds are recorded only for cancelled projects */
  REFUND_PROJECT_NOT_CANCELLED = 'REFUND_PROJECT_NOT_CANCELLED',
  /** The event was in {eventDistrict}; the project is in {projectDistrict} */
  REGION_MISMATCH = 'REGION_MISMATCH',
  /** Your registration is still being confirmed. Try again shortly. */
  REGISTRATION_CONFIRMING = 'REGISTRATION_CONFIRMING',
  /** Only admins and field officers register non-staff participants */
  REGISTRATION_NOT_ALLOWED = 'REGISTRATION_NOT_ALLOWED',
  /** Saved, but the ledger has not confirmed the registration yet. It will be confirmed automatically, or use sync. */
  REGISTRATION_UNCONFIRMED = 'REGISTRATION_UNCONFIRMED',
  /** This person is verified: revoke their access instead */
  REJECT_VERIFIED = 'REJECT_VERIFIED',
  /** This request is already cancelled */
  REQUEST_ALREADY_CANCELLED = 'REQUEST_ALREADY_CANCELLED',
  /** Request not found */
  REQUEST_NOT_FOUND = 'REQUEST_NOT_FOUND',
  /** The request or file is too large */
  REQUEST_TOO_LARGE = 'REQUEST_TOO_LARGE',
  /** This reservation is already being confirmed */
  RESERVATION_CONFIRMING = 'RESERVATION_CONFIRMING',
  /** Reservation not found */
  RESERVATION_NOT_FOUND = 'RESERVATION_NOT_FOUND',
  /** This reservation is {status} */
  RESERVATION_WRONG_STATUS = 'RESERVATION_WRONG_STATUS',
  /** This claim is {status}: start the review first */
  REVIEW_NOT_STARTED = 'REVIEW_NOT_STARTED',
  /** Write a note saying why when the reason is other */
  REVOCATION_NOTE_REQUIRED = 'REVOCATION_NOTE_REQUIRED',
  /** Your role cannot do this */
  ROLE_NOT_ALLOWED = 'ROLE_NOT_ALLOWED',
  /** Round not found */
  ROUND_NOT_FOUND = 'ROUND_NOT_FOUND',
  /** The figures worked out here do not match the ledger; reject this round */
  ROUND_NOT_VERIFIED = 'ROUND_NOT_VERIFIED',
  /** Another round for this project is still open */
  ROUND_OPEN = 'ROUND_OPEN',
  /** Staged rounds are for active projects, the final round for projects ready for sale */
  ROUND_WRONG_STAGE = 'ROUND_WRONG_STAGE',
  /** This round is {status} */
  ROUND_WRONG_STATUS = 'ROUND_WRONG_STATUS',
  /** You cannot cancel this sale */
  SALE_CANCEL_NOT_ALLOWED = 'SALE_CANCEL_NOT_ALLOWED',
  /** Sale not found */
  SALE_NOT_FOUND = 'SALE_NOT_FOUND',
  /** This sale is {status} */
  SALE_WRONG_STATUS = 'SALE_WRONG_STATUS',
  /** A round is approved by someone other than who prepared it */
  SAME_ACCOUNTANT = 'SAME_ACCOUNTANT',
  /** Details must be verified by someone other than who entered them */
  SAME_PERSON = 'SAME_PERSON',
  /** Something went wrong */
  SERVER_ERROR = 'SERVER_ERROR',
  /** A service the platform needs is unavailable */
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  /** Session is no longer valid */
  SESSION_ENDED = 'SESSION_ENDED',
  /** Session expired. Please sign in again. */
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  /** Sign in required */
  SIGN_IN_REQUIRED = 'SIGN_IN_REQUIRED',
  /** A site with this name already exists */
  SITE_NAME_EXISTS = 'SITE_NAME_EXISTS',
  /** Site not found */
  SITE_NOT_FOUND = 'SITE_NOT_FOUND',
  /** Only the super admin manages staff */
  STAFF_MANAGED_BY_SUPER_ADMIN = 'STAFF_MANAGED_BY_SUPER_ADMIN',
  /** Only the super admin registers staff */
  STAFF_REGISTERED_BY_SUPER_ADMIN = 'STAFF_REGISTERED_BY_SUPER_ADMIN',
  /** Everything feeding the final figures must be finished first */
  STILL_OUTSTANDING = 'STILL_OUTSTANDING',
  /** Every supplier must be a verified supplier */
  SUPPLIER_NOT_VERIFIED = 'SUPPLIER_NOT_VERIFIED',
  /** Sweep not found */
  SWEEP_NOT_FOUND = 'SWEEP_NOT_FOUND',
  /** A sweep is already running */
  SWEEP_RUNNING = 'SWEEP_RUNNING',
  /** Funding target and slot price must be above zero */
  TERMS_AMOUNTS_NOT_POSITIVE = 'TERMS_AMOUNTS_NOT_POSITIVE',
  /** Duration must be {min} to {max} months */
  TERMS_DURATION_RANGE = 'TERMS_DURATION_RANGE',
  /** The low estimate is above the high estimate */
  TERMS_ESTIMATES_REVERSED = 'TERMS_ESTIMATES_REVERSED',
  /** farmerId must be a verified farmer */
  TERMS_FARMER_NOT_VERIFIED = 'TERMS_FARMER_NOT_VERIFIED',
  /** The payout interval cannot be longer than the project */
  TERMS_INTERVAL_TOO_LONG = 'TERMS_INTERVAL_TOO_LONG',
  /** A long-term project lasts more than {min} months */
  TERMS_LONG_TOO_SHORT = 'TERMS_LONG_TOO_SHORT',
  /** Funding target must be a whole number of slots */
  TERMS_PARTIAL_SLOT = 'TERMS_PARTIAL_SLOT',
  /** Farmer, investor and WeGro shares must add up to 100% */
  TERMS_SHARES_NOT_100 = 'TERMS_SHARES_NOT_100',
  /** A short-term project has a single final payout */
  TERMS_SHORT_HAS_INTERVAL = 'TERMS_SHORT_HAS_INTERVAL',
  /** A short-term project lasts at most {max} months */
  TERMS_SHORT_TOO_LONG = 'TERMS_SHORT_TOO_LONG',
  /** A project can have at most {max} slots */
  TERMS_TOO_MANY_SLOTS = 'TERMS_TOO_MANY_SLOTS',
  /** The next staged round is not due yet */
  TOO_EARLY = 'TOO_EARLY',
  /** At most {max} photos */
  TOO_MANY_PHOTOS = 'TOO_MANY_PHOTOS',
  /** Too many requests; wait a moment */
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  /** Nothing changed since version {version} */
  UNCHANGED = 'UNCHANGED',
  /** Unit {unit} is used by active entries: {entries} */
  UNIT_IN_USE = 'UNIT_IN_USE',
  /** Unknown record type */
  UNKNOWN_RECORD_TYPE = 'UNKNOWN_RECORD_TYPE',
  /** This kind of content is not accepted */
  UNSUPPORTED_MEDIA_TYPE = 'UNSUPPORTED_MEDIA_TYPE',
  /** validUntil cannot be in the past */
  VALID_UNTIL_IN_PAST = 'VALID_UNTIL_IN_PAST',
  /** No such version */
  VERSION_NOT_FOUND = 'VERSION_NOT_FOUND',
  /** Limits apply only to proposed or active vouchers */
  VOUCHER_LIMITS_NOT_APPLICABLE = 'VOUCHER_LIMITS_NOT_APPLICABLE',
  /** This voucher is not active */
  VOUCHER_NOT_ACTIVE = 'VOUCHER_NOT_ACTIVE',
  /** Only unconfirmed proposals can be discarded */
  VOUCHER_NOT_DISCARDABLE = 'VOUCHER_NOT_DISCARDABLE',
  /** Voucher not found */
  VOUCHER_NOT_FOUND = 'VOUCHER_NOT_FOUND',
  /** The ledger has this voucher; it will appear shortly */
  VOUCHER_ON_LEDGER = 'VOUCHER_ON_LEDGER',
  /** Vouchers are issued only for funded or active projects */
  VOUCHER_PROJECT_STAGE = 'VOUCHER_PROJECT_STAGE',
  /** This voucher is {status} */
  VOUCHER_WRONG_STATUS = 'VOUCHER_WRONG_STATUS',
  /** Only a verified warehouse operator can be assigned */
  WAREHOUSE_OPERATOR_INVALID = 'WAREHOUSE_OPERATOR_INVALID',
  /** eventId must be a recorded weather event */
  WEATHER_EVENT_INVALID = 'WEATHER_EVENT_INVALID',
  /** Weather event not found */
  WEATHER_EVENT_NOT_FOUND = 'WEATHER_EVENT_NOT_FOUND',
  /** Current password is incorrect */
  WRONG_CURRENT_PASSWORD = 'WRONG_CURRENT_PASSWORD',
}
