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
  /** Too many failed sign-in attempts. Try again in {minutes} minutes. */
  AccountLocked = 'ACCOUNT_LOCKED',
  /** Your account is not verified */
  AccountNotVerified = 'ACCOUNT_NOT_VERIFIED',
  /** This account was not approved */
  AccountRejected = 'ACCOUNT_REJECTED',
  /** Already assigned to this field officer */
  AlreadyAssigned = 'ALREADY_ASSIGNED',
  /** This project has already claimed for this event */
  AlreadyClaimed = 'ALREADY_CLAIMED',
  /** This line is already paid */
  AlreadyPaid = 'ALREADY_PAID',
  /** Already being published */
  AlreadyPublishing = 'ALREADY_PUBLISHING',
  /** Already refunded */
  AlreadyRefunded = 'ALREADY_REFUNDED',
  /** Already rejected */
  AlreadyRejected = 'ALREADY_REJECTED',
  /** This project is already settled */
  AlreadySettled = 'ALREADY_SETTLED',
  /** Already verified */
  AlreadyVerified = 'ALREADY_VERIFIED',
  /** amount must be above zero */
  AmountNotPositive = 'AMOUNT_NOT_POSITIVE',
  /** Auditors have read-only access */
  AuditorReadOnly = 'AUDITOR_READ_ONLY',
  /** Phone number or password is incorrect */
  BadCredentials = 'BAD_CREDENTIALS',
  /** These details are already verified */
  BankDetailsAlreadyVerified = 'BANK_DETAILS_ALREADY_VERIFIED',
  /** This bank branch is already registered */
  BankExists = 'BANK_EXISTS',
  /** Bank not found */
  BankNotFound = 'BANK_NOT_FOUND',
  /** Only a verified bank officer can be assigned */
  BankOfficerInvalid = 'BANK_OFFICER_INVALID',
  /** {batch}: expired */
  BatchExpired = 'BATCH_EXPIRED',
  /** Batch not found */
  BatchNotFound = 'BATCH_NOT_FOUND',
  /** {batch}: not registered yet */
  BatchNotRegistered = 'BATCH_NOT_REGISTERED',
  /** {batch}: not one of your batches */
  BatchNotYours = 'BATCH_NOT_YOURS',
  /** {batch}: a batch of {input}, not {expected} */
  BatchWrongInput = 'BATCH_WRONG_INPUT',
  /** An entry with this code already exists */
  CatalogCodeExists = 'CATALOG_CODE_EXISTS',
  /** The entry {code} is no longer in use */
  CatalogCodeRetired = 'CATALOG_CODE_RETIRED',
  /** Unknown code {code} */
  CatalogCodeUnknown = 'CATALOG_CODE_UNKNOWN',
  /** No entry {code} */
  CatalogEntryNotFound = 'CATALOG_ENTRY_NOT_FOUND',
  /** An entry with this name already exists */
  CatalogNameExists = 'CATALOG_NAME_EXISTS',
  /** A referenced code does not exist */
  CatalogReferenceUnknown = 'CATALOG_REFERENCE_UNKNOWN',
  /** This changed meanwhile; try again */
  ChangedMeanwhile = 'CHANGED_MEANWHILE',
  /** checkedOn cannot be in the future */
  CheckInFuture = 'CHECK_IN_FUTURE',
  /** No assessment photo for this claim */
  ClaimHasNoPhoto = 'CLAIM_HAS_NO_PHOTO',
  /** Only the farmer's field officer or an admin can claim */
  ClaimNotAllowed = 'CLAIM_NOT_ALLOWED',
  /** Claim not found */
  ClaimNotFound = 'CLAIM_NOT_FOUND',
  /** No such photo on this claim */
  ClaimPhotoNotFound = 'CLAIM_PHOTO_NOT_FOUND',
  /** This claim is {status} */
  ClaimWrongStatus = 'CLAIM_WRONG_STATUS',
  /** Not possible in the current state */
  Conflict = 'CONFLICT',
  /** Consent not found */
  ConsentNotFound = 'CONSENT_NOT_FOUND',
  /** Coordinates must be decimal degrees with at most 6 decimal places */
  CoordinatesInvalid = 'COORDINATES_INVALID',
  /** Corrections in this batch refer to each other in a circle */
  CorrectionCycle = 'CORRECTION_CYCLE',
  /** correctsEntryId must be a record of the same project */
  CorrectionOtherProject = 'CORRECTION_OTHER_PROJECT',
  /** This cost is already voided */
  CostAlreadyVoided = 'COST_ALREADY_VOIDED',
  /** No bill photo for this cost */
  CostHasNoPhoto = 'COST_HAS_NO_PHOTO',
  /** Cost not found */
  CostNotFound = 'COST_NOT_FOUND',
  /** Costs are entered while a project is funded, active or ready for sale; this one is {stage} */
  CostProjectStage = 'COST_PROJECT_STAGE',
  /** Claims of {approvedTotal} taka are already approved; the cover cannot be less */
  CoverageBelowApproved = 'COVERAGE_BELOW_APPROVED',
  /** These are already the current terms */
  CoverUnchanged = 'COVER_UNCHANGED',
  /** damagePercent must be above 0 */
  DamageNotPositive = 'DAMAGE_NOT_POSITIVE',
  /** Database unavailable */
  DatabaseUnavailable = 'DATABASE_UNAVAILABLE',
  /** {unpaidDeals} approved deal(s) are waiting for payment */
  DealsPending = 'DEALS_PENDING',
  /** This deal is already being confirmed */
  DealConfirming = 'DEAL_CONFIRMING',
  /** The {side} has already confirmed this delivery */
  DeliveryAlreadyConfirmed = 'DELIVERY_ALREADY_CONFIRMED',
  /** Only the buyer or the handler confirms delivery */
  DeliveryConfirmNotAllowed = 'DELIVERY_CONFIRM_NOT_ALLOWED',
  /** No photo for this delivery */
  DeliveryHasNoPhoto = 'DELIVERY_HAS_NO_PHOTO',
  /** Stored details do not match the ledger; cannot verify */
  DetailsMismatch = 'DETAILS_MISMATCH',
  /** This draft was never published: delete it instead */
  DraftNeverPublished = 'DRAFT_NEVER_PUBLISHED',
  /** The same id appears twice in this batch */
  DuplicateInBatch = 'DUPLICATE_IN_BATCH',
  /** This id was already used for a different record */
  EntryIdReused = 'ENTRY_ID_REUSED',
  /** The cover does not include this kind of event (see coveredEventTypes) */
  EventNotCovered = 'EVENT_NOT_COVERED',
  /** Only {available} still available */
  ExceedsAvailable = 'EXCEEDS_AVAILABLE',
  /** Only {remaining} taka of the cover remains */
  ExceedsCoverage = 'EXCEEDS_COVERAGE',
  /** The voucher is worth more than the funding left for inputs */
  ExceedsFundingTarget = 'EXCEEDS_FUNDING_TARGET',
  /** Only {available} left on this voucher */
  ExceedsVoucherQuantity = 'EXCEEDS_VOUCHER_QUANTITY',
  /** expiresOn cannot be before intakeDate */
  ExpiresBeforeIntake = 'EXPIRES_BEFORE_INTAKE',
  /** expiresOn cannot be before producedOn */
  ExpiresBeforeProduced = 'EXPIRES_BEFORE_PRODUCED',
  /** The expiry date cannot be in the past */
  ExpiryInPast = 'EXPIRY_IN_PAST',
  /** Permission lasts at most a year; renew it when it ends */
  ExpiryTooLate = 'EXPIRY_TOO_LATE',
  /** Farmer not found */
  FarmerNotFound = 'FARMER_NOT_FOUND',
  /** Farm updates are recorded from funding until the produce is ready for sale */
  FarmUpdateWrongStage = 'FARM_UPDATE_WRONG_STAGE',
  /** officerId must be a verified field officer */
  FieldOfficerInvalid = 'FIELD_OFFICER_INVALID',
  /** Field record not found */
  FieldRecordNotFound = 'FIELD_RECORD_NOT_FOUND',
  /** A final round is open; reject it to change costs */
  FinalRoundOpen = 'FINAL_ROUND_OPEN',
  /** Not allowed */
  Forbidden = 'FORBIDDEN',
  /** You cannot cancel this handover */
  HandoverCancelNotAllowed = 'HANDOVER_CANCEL_NOT_ALLOWED',
  /** The ID check failed */
  IdCheckFailed = 'ID_CHECK_FAILED',
  /** The ID check flagged this person; review the flags and confirm with acknowledgeFlags */
  IdCheckFlagsNotAcknowledged = 'ID_CHECK_FLAGS_NOT_ACKNOWLEDGED',
  /** incurredOn cannot be in the future */
  IncurredInFuture = 'INCURRED_IN_FUTURE',
  /** Insurance applies while the crop is in the field (funded or active); this project is {stage} */
  InsuranceProjectStage = 'INSURANCE_PROJECT_STAGE',
  /** intakeDate cannot be in the future */
  IntakeInFuture = 'INTAKE_IN_FUTURE',
  /** Some batches cannot be used for this sale */
  InvalidBatches = 'INVALID_BATCHES',
  /** Some details are not valid */
  InvalidDetails = 'INVALID_DETAILS',
  /** Some values are missing or not valid (see details.fields) */
  InvalidInput = 'INVALID_INPUT',
  /** The record is not valid */
  InvalidRecord = 'INVALID_RECORD',
  /** The request could not be read */
  InvalidRequest = 'INVALID_REQUEST',
  /** The project terms are not valid */
  InvalidTerms = 'INVALID_TERMS',
  /** No job named {job} */
  JobNotFound = 'JOB_NOT_FOUND',
  /** {job} is running; try again when it finishes */
  JobRunning = 'JOB_RUNNING',
  /** A key replacement is already in progress */
  KeyReplacementPending = 'KEY_REPLACEMENT_PENDING',
  /** Blockchain transaction failed */
  LedgerFailed = 'LEDGER_FAILED',
  /** The ledger record does not match this person */
  LedgerMismatch = 'LEDGER_MISMATCH',
  /** Blockchain node unavailable */
  LedgerUnavailable = 'LEDGER_UNAVAILABLE',
  /** The amount for this line does not match the ledger */
  LineNotVerified = 'LINE_NOT_VERIFIED',
  /** Only the seller side or an admin can cancel this listing */
  ListingCancelNotAllowed = 'LISTING_CANCEL_NOT_ALLOWED',
  /** Only an admin or the farmer's field officer can list this */
  ListingNotAllowed = 'LISTING_NOT_ALLOWED',
  /** Listing not found */
  ListingNotFound = 'LISTING_NOT_FOUND',
  /** This listing is {status} */
  ListingWrongStatus = 'LISTING_WRONG_STATUS',
  /** Give both latitude and longitude, or neither */
  LocationIncomplete = 'LOCATION_INCOMPLETE',
  /** The location is outside Bangladesh */
  LocationOutsideBangladesh = 'LOCATION_OUTSIDE_BANGLADESH',
  /** A {recordType} needs the location */
  LocationRequired = 'LOCATION_REQUIRED',
  /** You already registered this lot number for this input */
  LotAlreadyRegistered = 'LOT_ALREADY_REGISTERED',
  /** {key}: above the maximum {max} */
  MeasurementAboveMax = 'MEASUREMENT_ABOVE_MAX',
  /** {key}: below the minimum {min} */
  MeasurementBelowMin = 'MEASUREMENT_BELOW_MIN',
  /** Measurement {key}: bound {bound} has more than {decimals} decimal places */
  MeasurementBoundDecimals = 'MEASUREMENT_BOUND_DECIMALS',
  /** Measurement key {key} is used twice */
  MeasurementKeyRepeated = 'MEASUREMENT_KEY_REPEATED',
  /** {key}: must be a number with at most {decimals} decimal places */
  MeasurementNotANumber = 'MEASUREMENT_NOT_A_NUMBER',
  /** Measurement {key}: min is above max */
  MeasurementRangeInvalid = 'MEASUREMENT_RANGE_INVALID',
  /** {key}: required */
  MeasurementRequired = 'MEASUREMENT_REQUIRED',
  /** {key}: not a measurement of this record type */
  MeasurementUnknown = 'MEASUREMENT_UNKNOWN',
  /** newExpiresOn must be later than the current expiry */
  NewExpiryNotLater = 'NEW_EXPIRY_NOT_LATER',
  /** A person with this NID is already registered */
  NidAlreadyRegistered = 'NID_ALREADY_REGISTERED',
  /** There is no new profit to split */
  NothingToDistribute = 'NOTHING_TO_DISTRIBUTE',
  /** Notification not found */
  NotificationNotFound = 'NOTIFICATION_NOT_FOUND',
  /** You are not assigned to a bank */
  NotAssignedToBank = 'NOT_ASSIGNED_TO_BANK',
  /** Only farmers have a field officer */
  NotAFarmer = 'NOT_A_FARMER',
  /** Only farmers and investors receive payouts */
  NotAPayee = 'NOT_A_PAYEE',
  /** Only {available} slots are available */
  NotEnoughSlots = 'NOT_ENOUGH_SLOTS',
  /** Only the farmer's field officer can do this */
  NotFarmersOfficer = 'NOT_FARMERS_OFFICER',
  /** Not confirmed by the ledger yet; keep the draft and send it again later */
  NotConfirmed = 'NOT_CONFIRMED',
  /** Not found */
  NotFound = 'NOT_FOUND',
  /** This project is not insured */
  NotInsured = 'NOT_INSURED',
  /** This person is not paid in this round */
  NotInRound = 'NOT_IN_ROUND',
  /** Only an operator of the issuing site can do this */
  NotIssuingSiteOperator = 'NOT_ISSUING_SITE_OPERATOR',
  /** Stored crops and spices are sold through their warehouse receipts */
  NotPerishable = 'NOT_PERISHABLE',
  /** Only the project's insurer can review this claim */
  NotProjectInsurer = 'NOT_PROJECT_INSURER',
  /** Only the receipt owner's side can list it */
  NotReceiptOwner = 'NOT_RECEIPT_OWNER',
  /** You are not assigned to a warehouse site */
  NotSiteOperator = 'NOT_SITE_OPERATOR',
  /** This project pays out only once, at the end */
  NotStaged = 'NOT_STAGED',
  /** Fresh produce is sold directly, not stored */
  NotStorable = 'NOT_STORABLE',
  /** This farmer has not given your bank permission */
  NoActiveConsent = 'NO_ACTIVE_CONSENT',
  /** This bank has no current permission to withdraw */
  NoConsentToWithdraw = 'NO_CONSENT_TO_WITHDRAW',
  /** No insurer covers this project yet */
  NoCoverage = 'NO_COVERAGE',
  /** No demo account for role {role} yet */
  NoDemoAccount = 'NO_DEMO_ACCOUNT',
  /** No details waiting */
  NoDetailsWaiting = 'NO_DETAILS_WAITING',
  /** No fingerprint stored */
  NoFingerprint = 'NO_FINGERPRINT',
  /** The farmer has no finished projects yet */
  NoFinishedProjects = 'NO_FINISHED_PROJECTS',
  /** No handover is waiting on this receipt */
  NoHandoverWaiting = 'NO_HANDOVER_WAITING',
  /** This investor holds no slots in the project */
  NoSlotsHeld = 'NO_SLOTS_HELD',
  /** No statement for this participant */
  NoStatement = 'NO_STATEMENT',
  /** This farmer has no track record yet */
  NoTrackRecord = 'NO_TRACK_RECORD',
  /** observedAt is in the future: check the phone's clock */
  ObservedAtFuture = 'OBSERVED_AT_FUTURE',
  /** observedAt is not a valid time */
  ObservedAtInvalid = 'OBSERVED_AT_INVALID',
  /** occurredOn cannot be in the future */
  OccurredInFuture = 'OCCURRED_IN_FUTURE',
  /** Offer not found */
  OfferNotFound = 'OFFER_NOT_FOUND',
  /** This offer is {status} */
  OfferWrongStatus = 'OFFER_WRONG_STATUS',
  /** Another insurer covers this project */
  OtherInsurer = 'OTHER_INSURER',
  /** Only admins manage participants */
  ParticipantsManagedByAdmins = 'PARTICIPANTS_MANAGED_BY_ADMINS',
  /** Participant not found */
  ParticipantNotFound = 'PARTICIPANT_NOT_FOUND',
  /** The registration is not confirmed on the ledger yet */
  ParticipantUnconfirmed = 'PARTICIPANT_UNCONFIRMED',
  /** Change your temporary password first */
  PasswordChangeRequired = 'PASSWORD_CHANGE_REQUIRED',
  /** New password must differ from the current one */
  PasswordUnchanged = 'PASSWORD_UNCHANGED',
  /** A different payment for this line is being recorded */
  PaymentInProgress = 'PAYMENT_IN_PROGRESS',
  /** The payment deadline for this deal has passed */
  PaymentOverdue = 'PAYMENT_OVERDUE',
  /** This payment reference was already used */
  PaymentRefAlreadyUsed = 'PAYMENT_REF_ALREADY_USED',
  /** A payment reference must be 1-128 characters */
  PaymentRefInvalid = 'PAYMENT_REF_INVALID',
  /** to must not be before from */
  PeriodReversed = 'PERIOD_REVERSED',
  /** A period is at most {maxDays} days */
  PeriodTooLong = 'PERIOD_TOO_LONG',
  /** This phone number is already registered */
  PhoneAlreadyRegistered = 'PHONE_ALREADY_REGISTERED',
  /** The image file is damaged */
  PhotoDamaged = 'PHOTO_DAMAGED',
  /** Send the photo as the "file" field */
  PhotoFieldMissing = 'PHOTO_FIELD_MISSING',
  /** The photo file is missing */
  PhotoFileMissing = 'PHOTO_FILE_MISSING',
  /** Photo not found */
  PhotoNotFound = 'PHOTO_NOT_FOUND',
  /** The photo must be one you uploaded */
  PhotoNotYours = 'PHOTO_NOT_YOURS',
  /** A {recordType} needs a photo */
  PhotoRequired = 'PHOTO_REQUIRED',
  /** A photo must be 1 byte to {maxMb} MB */
  PhotoSize = 'PHOTO_SIZE',
  /** Photos must be JPEG, PNG or WebP */
  PhotoType = 'PHOTO_TYPE',
  /** producedOn cannot be in the future */
  ProducedInFuture = 'PRODUCED_IN_FUTURE',
  /** This is done only while the project is active */
  ProjectNotActive = 'PROJECT_NOT_ACTIVE',
  /** Project not found */
  ProjectNotFound = 'PROJECT_NOT_FOUND',
  /** This project is not open for funding */
  ProjectNotOpen = 'PROJECT_NOT_OPEN',
  /** Publish the project first */
  ProjectNotPublished = 'PROJECT_NOT_PUBLISHED',
  /** Published projects cannot be changed or deleted */
  ProjectPublishedLocked = 'PROJECT_PUBLISHED_LOCKED',
  /** Saved on the ledger, but the database copy could not be updated yet; it will be retried automatically. Do not repeat the action. */
  ReadModelUpdateFailed = 'READ_MODEL_UPDATE_FAILED',
  /** This receipt has expired; the site must re-check and extend it first */
  ReceiptExpired = 'RECEIPT_EXPIRED',
  /** Receipt not found */
  ReceiptNotFound = 'RECEIPT_NOT_FOUND',
  /** Only an issued receipt can be used for this; this one is {status} */
  ReceiptNotIssued = 'RECEIPT_NOT_ISSUED',
  /** This receipt is {status} */
  ReceiptWrongStatus = 'RECEIPT_WRONG_STATUS',
  /** This record has no photo */
  RecordHasNoPhoto = 'RECORD_HAS_NO_PHOTO',
  /** Record not found */
  RecordNotFound = 'RECORD_NOT_FOUND',
  /** A different refund for this investor is being recorded */
  RefundInProgress = 'REFUND_IN_PROGRESS',
  /** Refunds are recorded only for cancelled projects */
  RefundProjectNotCancelled = 'REFUND_PROJECT_NOT_CANCELLED',
  /** The event was in {eventDistrict}; the project is in {projectDistrict} */
  RegionMismatch = 'REGION_MISMATCH',
  /** Your registration is still being confirmed. Try again shortly. */
  RegistrationConfirming = 'REGISTRATION_CONFIRMING',
  /** Only admins and field officers register non-staff participants */
  RegistrationNotAllowed = 'REGISTRATION_NOT_ALLOWED',
  /** Saved, but the ledger has not confirmed the registration yet. It will be confirmed automatically, or use sync. */
  RegistrationUnconfirmed = 'REGISTRATION_UNCONFIRMED',
  /** This request is already cancelled */
  RequestAlreadyCancelled = 'REQUEST_ALREADY_CANCELLED',
  /** Request not found */
  RequestNotFound = 'REQUEST_NOT_FOUND',
  /** The request or file is too large */
  RequestTooLarge = 'REQUEST_TOO_LARGE',
  /** This reservation is already being confirmed */
  ReservationConfirming = 'RESERVATION_CONFIRMING',
  /** Reservation not found */
  ReservationNotFound = 'RESERVATION_NOT_FOUND',
  /** This reservation is {status} */
  ReservationWrongStatus = 'RESERVATION_WRONG_STATUS',
  /** This claim is {status}: start the review first */
  ReviewNotStarted = 'REVIEW_NOT_STARTED',
  /** Your role cannot do this */
  RoleNotAllowed = 'ROLE_NOT_ALLOWED',
  /** Round not found */
  RoundNotFound = 'ROUND_NOT_FOUND',
  /** The figures worked out here do not match the ledger; reject this round */
  RoundNotVerified = 'ROUND_NOT_VERIFIED',
  /** Another round for this project is still open */
  RoundOpen = 'ROUND_OPEN',
  /** Staged rounds are for active projects, the final round for projects ready for sale */
  RoundWrongStage = 'ROUND_WRONG_STAGE',
  /** This round is {status} */
  RoundWrongStatus = 'ROUND_WRONG_STATUS',
  /** You cannot cancel this sale */
  SaleCancelNotAllowed = 'SALE_CANCEL_NOT_ALLOWED',
  /** Sale not found */
  SaleNotFound = 'SALE_NOT_FOUND',
  /** This sale is {status} */
  SaleWrongStatus = 'SALE_WRONG_STATUS',
  /** A round is approved by someone other than who prepared it */
  SameAccountant = 'SAME_ACCOUNTANT',
  /** Details must be verified by someone other than who entered them */
  SamePerson = 'SAME_PERSON',
  /** Something went wrong */
  ServerError = 'SERVER_ERROR',
  /** A service the platform needs is unavailable */
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
  /** Session is no longer valid */
  SessionEnded = 'SESSION_ENDED',
  /** Session expired. Please sign in again. */
  SessionExpired = 'SESSION_EXPIRED',
  /** Sign in required */
  SignInRequired = 'SIGN_IN_REQUIRED',
  /** A site with this name already exists */
  SiteNameExists = 'SITE_NAME_EXISTS',
  /** Site not found */
  SiteNotFound = 'SITE_NOT_FOUND',
  /** Only the super admin manages staff */
  StaffManagedBySuperAdmin = 'STAFF_MANAGED_BY_SUPER_ADMIN',
  /** Only the super admin registers staff */
  StaffRegisteredBySuperAdmin = 'STAFF_REGISTERED_BY_SUPER_ADMIN',
  /** Everything feeding the final figures must be finished first */
  StillOutstanding = 'STILL_OUTSTANDING',
  /** Every supplier must be a verified supplier */
  SupplierNotVerified = 'SUPPLIER_NOT_VERIFIED',
  /** Sweep not found */
  SweepNotFound = 'SWEEP_NOT_FOUND',
  /** A sweep is already running */
  SweepRunning = 'SWEEP_RUNNING',
  /** Funding target and slot price must be above zero */
  TermsAmountsNotPositive = 'TERMS_AMOUNTS_NOT_POSITIVE',
  /** Duration must be {min} to {max} months */
  TermsDurationRange = 'TERMS_DURATION_RANGE',
  /** The low estimate is above the high estimate */
  TermsEstimatesReversed = 'TERMS_ESTIMATES_REVERSED',
  /** farmerId must be a verified farmer */
  TermsFarmerNotVerified = 'TERMS_FARMER_NOT_VERIFIED',
  /** The payout interval cannot be longer than the project */
  TermsIntervalTooLong = 'TERMS_INTERVAL_TOO_LONG',
  /** A long-term project lasts more than {min} months */
  TermsLongTooShort = 'TERMS_LONG_TOO_SHORT',
  /** Funding target must be a whole number of slots */
  TermsPartialSlot = 'TERMS_PARTIAL_SLOT',
  /** Farmer, investor and WeGro shares must add up to 100% */
  TermsSharesNot100 = 'TERMS_SHARES_NOT_100',
  /** A short-term project has a single final payout */
  TermsShortHasInterval = 'TERMS_SHORT_HAS_INTERVAL',
  /** A short-term project lasts at most {max} months */
  TermsShortTooLong = 'TERMS_SHORT_TOO_LONG',
  /** A project can have at most {max} slots */
  TermsTooManySlots = 'TERMS_TOO_MANY_SLOTS',
  /** The next staged round is not due yet */
  TooEarly = 'TOO_EARLY',
  /** At most {max} photos */
  TooManyPhotos = 'TOO_MANY_PHOTOS',
  /** Too many requests; wait a moment */
  TooManyRequests = 'TOO_MANY_REQUESTS',
  /** Nothing changed since version {version} */
  Unchanged = 'UNCHANGED',
  /** Unit {unit} is used by active entries: {entries} */
  UnitInUse = 'UNIT_IN_USE',
  /** Unknown record type */
  UnknownRecordType = 'UNKNOWN_RECORD_TYPE',
  /** This kind of content is not accepted */
  UnsupportedMediaType = 'UNSUPPORTED_MEDIA_TYPE',
  /** validUntil cannot be in the past */
  ValidUntilInPast = 'VALID_UNTIL_IN_PAST',
  /** No such version */
  VersionNotFound = 'VERSION_NOT_FOUND',
  /** Limits apply only to proposed or active vouchers */
  VoucherLimitsNotApplicable = 'VOUCHER_LIMITS_NOT_APPLICABLE',
  /** This voucher is not active */
  VoucherNotActive = 'VOUCHER_NOT_ACTIVE',
  /** Only unconfirmed proposals can be discarded */
  VoucherNotDiscardable = 'VOUCHER_NOT_DISCARDABLE',
  /** Voucher not found */
  VoucherNotFound = 'VOUCHER_NOT_FOUND',
  /** The ledger has this voucher; it will appear shortly */
  VoucherOnLedger = 'VOUCHER_ON_LEDGER',
  /** Vouchers are issued only for funded or active projects */
  VoucherProjectStage = 'VOUCHER_PROJECT_STAGE',
  /** This voucher is {status} */
  VoucherWrongStatus = 'VOUCHER_WRONG_STATUS',
  /** Only a verified warehouse operator can be assigned */
  WarehouseOperatorInvalid = 'WAREHOUSE_OPERATOR_INVALID',
  /** eventId must be a recorded weather event */
  WeatherEventInvalid = 'WEATHER_EVENT_INVALID',
  /** Weather event not found */
  WeatherEventNotFound = 'WEATHER_EVENT_NOT_FOUND',
  /** Current password is incorrect */
  WrongCurrentPassword = 'WRONG_CURRENT_PASSWORD',
}
