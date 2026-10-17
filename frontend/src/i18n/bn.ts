import type { Translation } from './en';

/**
 * Bengali. Loaded only when chosen. To be checked by a native speaker before
 * release (NFR-8, TODO item 24).
 */
export const bn: Translation = {
  language: {
    label: 'ভাষা',
    notSaved:
      'আপনার ভাষা অ্যাকাউন্টে সংরক্ষণ করা যায়নি। এটি শুধু এই ডিভাইসে প্রযোজ্য।',
  },
  units: {
    minute_one: '{{count, number}} মিনিট',
    minute_other: '{{count, number}} মিনিট',
    slot_one: '{{count, number}}টি স্লট',
    slot_other: '{{count, number}}টি স্লট',
  },
  roles: {
    super_admin: 'সুপার অ্যাডমিন',
    admin: 'অ্যাডমিন',
    operations: 'অপারেশনস',
    accounts: 'হিসাব বিভাগ',
    field_officer: 'মাঠ কর্মকর্তা',
    farmer: 'কৃষক',
    investor: 'বিনিয়োগকারী',
    warehouse: 'গুদাম পরিচালক',
    bank: 'ব্যাংক',
    supplier: 'সরবরাহকারী',
    buyer: 'ক্রেতা',
    insurer: 'বীমাকারী',
    auditor: 'নিরীক্ষক',
  },
  /** Statuses, stages and other values shown inside sentences: {{status, word}}. */
  words: {
    none: 'আর চালু নেই',
    submitted: 'এখনও নিশ্চিত হচ্ছে',
    pending: 'অপেক্ষমাণ',
    confirmed: 'নিশ্চিত',
    expired: 'মেয়াদোত্তীর্ণ',
    cancelled: 'বাতিল',
    proposed: 'প্রস্তাবিত',
    active: 'চালু',
    rejected: 'প্রত্যাখ্যাত',
    approved: 'অনুমোদিত',
    registered: 'নিবন্ধিত',
    verified: 'যাচাইকৃত',
    issued: 'ইস্যু করা',
    pending_handover: 'হস্তান্তরের অপেক্ষায়',
    listed: 'বিক্রির তালিকায়',
    sold: 'বিক্রিত',
    collected: 'তুলে নেওয়া',
    sold_out: 'সব বিক্রি হয়ে গেছে',
    open: 'খোলা',
    withdrawn: 'প্রত্যাহার করা',
    paid: 'পরিশোধিত',
    delivered: 'সরবরাহ করা',
    triggered: 'খোলা, এখনও পর্যালোচনা শুরু হয়নি',
    under_review: 'পর্যালোচনাধীন',
    prepared: 'অনুমোদনের অপেক্ষায়',
    recorded: 'নথিভুক্ত',
    voided: 'বাতিল করা',
    draft: 'খসড়া',
    open_for_funding: 'অর্থায়নের জন্য খোলা',
    funded: 'অর্থায়িত',
    ready_for_sale: 'বিক্রির জন্য প্রস্তুত',
    paid_out: 'অর্থ প্রদান সম্পন্ন',
    closed: 'বন্ধ',
    buyer: 'ক্রেতা',
    handler: 'হস্তান্তরকারী',
    'node-unreachable': 'ব্লকচেইন নোডে সংযোগ করা যাচ্ছিল না',
    'indexer-behind': 'ডেটাবেস লেজারের চেয়ে পিছিয়ে ছিল',
    'indexer-failing': 'লেজারের ঘটনা কপি করা বারবার ব্যর্থ হচ্ছিল',
  },
  errors: {
    kind: {
      network:
        'WeGro-তে সংযোগ করা যাচ্ছে না। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।',
      unauthenticated: 'অনুগ্রহ করে আবার সাইন ইন করুন।',
      forbidden: 'এই কাজটি করার অনুমতি আপনার নেই।',
      'not-found': 'এটি খুঁজে পাওয়া যায়নি। হয়তো সরিয়ে ফেলা হয়েছে।',
      invalid: 'কিছু তথ্য ঠিক করতে হবে। দেখে আবার চেষ্টা করুন।',
      conflict:
        'রেকর্ডটি বদলে গেছে, তাই এখন এটি করা যাচ্ছে না। পাতাটি রিফ্রেশ করে আবার চেষ্টা করুন।',
      'rate-limited':
        'অনেকবার চেষ্টা করা হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।',
      unavailable:
        'সেবাটি কিছুক্ষণের জন্য পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।',
      server: 'আমাদের দিকে একটি সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
    },
    /** By the backend's error code (ledger refusals fall back to their kind). */
    code: {
      BAD_CREDENTIALS: 'ফোন নম্বর বা পাসওয়ার্ড সঠিক নয়।',
      ACCOUNT_LOCKED:
        'অনেকবার ভুল চেষ্টা হয়েছে। $t(units.minute, {"count": {{minutes}} }) পরে আবার চেষ্টা করুন।',
      SIGN_IN_REQUIRED: 'অনুগ্রহ করে সাইন ইন করুন।',
      SESSION_EXPIRED:
        'আপনার সেশনের মেয়াদ শেষ হয়েছে। অনুগ্রহ করে আবার সাইন ইন করুন।',
      SESSION_ENDED:
        'আপনাকে সাইন আউট করা হয়েছে। অনুগ্রহ করে আবার সাইন ইন করুন।',
      PASSWORD_CHANGE_REQUIRED: 'আগে আপনার অস্থায়ী পাসওয়ার্ড বদলান।',
      REGISTRATION_CONFIRMING:
        'আপনার নিবন্ধন এখনও নিশ্চিত করা হচ্ছে। একটু পরে আবার চেষ্টা করুন।',
      ACCOUNT_REJECTED: 'এই অ্যাকাউন্টটি অনুমোদন পায়নি।',
      ACCOUNT_NOT_VERIFIED: 'আপনার অ্যাকাউন্ট এখনও যাচাই করা হয়নি।',
      WRONG_CURRENT_PASSWORD: 'আপনার বর্তমান পাসওয়ার্ড সঠিক নয়।',
      PASSWORD_UNCHANGED:
        'নতুন পাসওয়ার্ড বর্তমান পাসওয়ার্ড থেকে আলাদা হতে হবে।',
      NO_DEMO_ACCOUNT: '{{role, role}}-এর জন্য এখনও কোনো ডেমো অ্যাকাউন্ট নেই।',
      ROLE_NOT_ALLOWED: 'আপনার ভূমিকায় এই কাজটি করা যায় না।',
      AUDITOR_READ_ONLY: 'নিরীক্ষকেরা শুধু দেখতে পারেন, কিছু বদলাতে পারেন না।',
      NOT_FOUND: 'এটি খুঁজে পাওয়া যায়নি।',
      FORBIDDEN: 'এই কাজটি করার অনুমতি আপনার নেই।',
      CONFLICT: 'এখন এটি করা যাচ্ছে না।',
      INVALID_REQUEST: 'অনুরোধটি বোঝা যায়নি। তথ্য দেখে আবার চেষ্টা করুন।',
      INVALID_INPUT: 'কিছু তথ্য নেই বা সঠিক নয়: {{fields}}',
      INVALID_DETAILS: 'কিছু তথ্য সঠিক নয়: {{problems}}',
      REQUEST_TOO_LARGE: 'এটি পাঠানোর জন্য অনেক বড়।',
      UNSUPPORTED_MEDIA_TYPE: 'এই ধরনের ফাইল গ্রহণ করা হয় না।',
      TOO_MANY_REQUESTS:
        'অনেকবার চেষ্টা করা হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।',
      SERVICE_UNAVAILABLE:
        'সেবাটি কিছুক্ষণের জন্য পাওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।',
      SERVER_ERROR:
        'আমাদের দিকে একটি সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
      DATABASE_UNAVAILABLE: 'এই মুহূর্তে ডেটাবেসে সংযোগ করা যাচ্ছে না।',
      LEDGER_UNAVAILABLE:
        'এই মুহূর্তে লেজারে সংযোগ করা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।',
      LEDGER_FAILED:
        'লেজারে এটি নথিভুক্ত করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।',
      READ_MODEL_UPDATE_FAILED:
        'লেজারে সংরক্ষিত হয়েছে; শীঘ্রই এখানে দেখা যাবে। আবার করবেন না।',
      CHANGED_MEANWHILE:
        'আপনি কাজ করার সময় এটি বদলে গেছে। রিফ্রেশ করে আবার চেষ্টা করুন।',
      RECORD_NOT_FOUND: 'এই রেকর্ডটি খুঁজে পাওয়া যায়নি।',
      UNKNOWN_RECORD_TYPE: 'এই ধরনের রেকর্ড পরিচিত নয়।',
      NOTIFICATION_NOT_FOUND: 'এই বিজ্ঞপ্তিটি খুঁজে পাওয়া যায়নি।',
      JOB_NOT_FOUND: '{{job}} নামে কোনো কাজ নেই।',
      JOB_RUNNING: '{{job}} এখন চলছে। শেষ হলে আবার চেষ্টা করুন।',
      SWEEP_RUNNING: 'সব রেকর্ডের একটি যাচাই এখন চলছে।',
      SWEEP_NOT_FOUND: 'এই যাচাইটি খুঁজে পাওয়া যায়নি।',
      PARTICIPANT_NOT_FOUND: 'এই ব্যক্তিকে খুঁজে পাওয়া যায়নি।',
      FARMER_NOT_FOUND: 'এই কৃষককে খুঁজে পাওয়া যায়নি।',
      PHONE_ALREADY_REGISTERED: 'এই ফোন নম্বরটি আগেই নিবন্ধিত।',
      NID_ALREADY_REGISTERED: 'এই এনআইডি দিয়ে একজন আগেই নিবন্ধিত।',
      ID_CHECK_FAILED:
        'পরিচয় যাচাই ব্যর্থ হয়েছে। তথ্য দেখে আবার চেষ্টা করুন।',
      ID_CHECK_FLAGS_NOT_ACKNOWLEDGED:
        'পরিচয় যাচাইয়ে কিছু সতর্কতা এসেছে। যাচাই করার আগে সেগুলো দেখে নিশ্চিত করুন।',
      DETAILS_MISMATCH:
        'সংরক্ষিত তথ্য লেজারের সঙ্গে মেলে না, তাই এই ব্যক্তিকে যাচাই করা যাচ্ছে না।',
      LEDGER_MISMATCH: 'লেজারের রেকর্ড এই ব্যক্তির সঙ্গে মেলে না।',
      REGISTRATION_UNCONFIRMED:
        'সংরক্ষিত হয়েছে, তবে লেজারে এখনও নিশ্চিত হয়নি। এটি নিজে থেকেই নিশ্চিত হবে।',
      PARTICIPANT_UNCONFIRMED: 'এই ব্যক্তির নিবন্ধন লেজারে এখনও নিশ্চিত হয়নি।',
      ALREADY_VERIFIED: 'এই ব্যক্তি আগেই যাচাই করা হয়েছে।',
      ALREADY_REJECTED: 'এই ব্যক্তিকে আগেই প্রত্যাখ্যান করা হয়েছে।',
      NOT_A_FARMER: 'শুধু কৃষকদের মাঠ কর্মকর্তা থাকে।',
      FIELD_OFFICER_INVALID: 'একজন যাচাইকৃত মাঠ কর্মকর্তা বেছে নিন।',
      ALREADY_ASSIGNED: 'এই কৃষকের মাঠ কর্মকর্তা আগে থেকেই ইনি।',
      KEY_REPLACEMENT_PENDING: 'একটি চাবি বদলের কাজ আগে থেকেই চলছে।',
      NO_FINGERPRINT: 'এই ব্যক্তির কোনো লেজার ফিঙ্গারপ্রিন্ট সংরক্ষিত নেই।',
      STAFF_REGISTERED_BY_SUPER_ADMIN:
        'শুধু সুপার অ্যাডমিন কর্মী নিবন্ধন করতে পারেন।',
      REGISTRATION_NOT_ALLOWED:
        'শুধু অ্যাডমিন ও মাঠ কর্মকর্তারা নিবন্ধন করতে পারেন।',
      STAFF_MANAGED_BY_SUPER_ADMIN:
        'শুধু সুপার অ্যাডমিন কর্মীদের পরিচালনা করতে পারেন।',
      PARTICIPANTS_MANAGED_BY_ADMINS:
        'শুধু অ্যাডমিনরা অংশগ্রহণকারীদের পরিচালনা করতে পারেন।',
      BANK_DETAILS_ALREADY_VERIFIED: 'এই ব্যাংকের তথ্য আগেই যাচাই করা হয়েছে।',
      SAME_PERSON:
        'যিনি ব্যাংকের তথ্য দিয়েছেন, তিনি ছাড়া অন্য কেউ তা যাচাই করবেন।',
      NOT_A_PAYEE: 'শুধু কৃষক ও বিনিয়োগকারীরা অর্থ পান।',
      NO_DETAILS_WAITING:
        'যাচাইয়ের জন্য কোনো নতুন ব্যাংকের তথ্য অপেক্ষায় নেই।',
      CATALOG_ENTRY_NOT_FOUND: '{{code}} নামে কোনো এন্ট্রি নেই।',
      CATALOG_CODE_EXISTS: 'এই কোডে একটি এন্ট্রি আগেই আছে।',
      CATALOG_NAME_EXISTS: 'এই নামে একটি এন্ট্রি আগেই আছে।',
      CATALOG_CODE_UNKNOWN: '{{code}} তালিকায় নেই।',
      CATALOG_CODE_RETIRED: '{{code}} আর ব্যবহার হয় না।',
      CATALOG_REFERENCE_UNKNOWN: 'এটি যে কোডের কথা বলছে, সেটি নেই।',
      UNIT_IN_USE: '{{unit}} এককটি এখনও ব্যবহার হচ্ছে: {{entries}}।',
      MEASUREMENT_KEY_REPEATED: '{{key}} পরিমাপটি দুইবার আছে।',
      MEASUREMENT_RANGE_INVALID:
        '{{key}}: সর্বনিম্ন মান সর্বোচ্চ মানের চেয়ে বেশি।',
      MEASUREMENT_BOUND_DECIMALS:
        '{{key}}: সীমা {{bound, number}}-এ {{decimals, number}}টির বেশি দশমিক ঘর আছে।',
      PROJECT_NOT_FOUND: 'এই প্রকল্পটি খুঁজে পাওয়া যায়নি।',
      ALREADY_PUBLISHING: 'এই প্রকল্পটি প্রকাশ করা হচ্ছে।',
      DRAFT_NEVER_PUBLISHED:
        'এই খসড়াটি কখনও প্রকাশ করা হয়নি। এর বদলে এটি মুছে ফেলুন।',
      PROJECT_NOT_PUBLISHED: 'আগে প্রকল্পটি প্রকাশ করুন।',
      PROJECT_PUBLISHED_LOCKED: 'প্রকাশিত প্রকল্প বদলানো বা মোছা যায় না।',
      INVALID_TERMS: 'প্রকল্পের শর্তাবলি সঠিক নয়: {{problems}}',
      TERMS_AMOUNTS_NOT_POSITIVE:
        'অর্থায়নের লক্ষ্য ও স্লটের দাম শূন্যের বেশি হতে হবে।',
      TERMS_PARTIAL_SLOT: 'অর্থায়নের লক্ষ্য পূর্ণ সংখ্যক স্লটের সমান হতে হবে।',
      TERMS_TOO_MANY_SLOTS:
        'একটি প্রকল্পে সর্বোচ্চ {{max, number}}টি স্লট থাকতে পারে।',
      TERMS_SHARES_NOT_100:
        'কৃষক, বিনিয়োগকারী ও WeGro-এর ভাগ মিলিয়ে ১০০% হতে হবে।',
      TERMS_DURATION_RANGE:
        'মেয়াদ {{min, number}} থেকে {{max, number}} মাস হতে হবে।',
      TERMS_SHORT_TOO_LONG:
        'স্বল্পমেয়াদি প্রকল্প সর্বোচ্চ {{max, number}} মাস চলে।',
      TERMS_SHORT_HAS_INTERVAL: 'স্বল্পমেয়াদি প্রকল্প একবারই, শেষে অর্থ দেয়।',
      TERMS_LONG_TOO_SHORT:
        'দীর্ঘমেয়াদি প্রকল্প {{min, number}} মাসের বেশি চলে।',
      TERMS_INTERVAL_TOO_LONG:
        'অর্থ প্রদানের বিরতি প্রকল্পের মেয়াদের চেয়ে বেশি হতে পারে না।',
      TERMS_ESTIMATES_REVERSED: 'কম অনুমানটি বেশি অনুমানের চেয়ে বড়।',
      TERMS_FARMER_NOT_VERIFIED: 'একজন যাচাইকৃত কৃষক বেছে নিন।',
      PROJECT_NOT_OPEN: 'এই প্রকল্পটি অর্থায়নের জন্য খোলা নেই।',
      PROJECT_NOT_ACTIVE: 'প্রকল্প চালু থাকলেই শুধু এটি করা যায়।',
      NOT_ENOUGH_SLOTS:
        'মাত্র $t(units.slot, {"count": {{available}} }) বাকি আছে।',
      RESERVATION_NOT_FOUND: 'এই রিজার্ভেশনটি খুঁজে পাওয়া যায়নি।',
      RESERVATION_WRONG_STATUS: 'এই রিজার্ভেশনটি {{status, word}}।',
      RESERVATION_CONFIRMING: 'এই রিজার্ভেশনটি নিশ্চিত করা হচ্ছে।',
      PAYMENT_REF_INVALID: 'পেমেন্ট রেফারেন্স ১ থেকে ১২৮ অক্ষরের হতে হবে।',
      PAYMENT_REF_ALREADY_USED: 'এই পেমেন্ট রেফারেন্সটি আগেই ব্যবহার হয়েছে।',
      REFUND_PROJECT_NOT_CANCELLED:
        'শুধু বাতিল প্রকল্পের টাকা ফেরত নথিভুক্ত হয়।',
      NO_SLOTS_HELD: 'এই প্রকল্পে এই বিনিয়োগকারীর কোনো স্লট নেই।',
      ALREADY_REFUNDED: 'এই বিনিয়োগকারীর টাকা আগেই ফেরত দেওয়া হয়েছে।',
      REFUND_IN_PROGRESS: 'এই বিনিয়োগকারীর আরেকটি টাকা ফেরত নথিভুক্ত হচ্ছে।',
      VOUCHER_NOT_FOUND: 'এই ভাউচারটি খুঁজে পাওয়া যায়নি।',
      VOUCHER_PROJECT_STAGE:
        'শুধু অর্থায়িত বা চালু প্রকল্পের জন্য ভাউচার দেওয়া হয়।',
      EXCEEDS_FUNDING_TARGET:
        'ভাউচারের মূল্য {{value, taka}}, কিন্তু উপকরণের জন্য অর্থায়নের মাত্র {{room, taka}} বাকি আছে।',
      VOUCHER_LIMITS_NOT_APPLICABLE:
        'সীমা শুধু প্রস্তাবিত বা চালু ভাউচারে প্রযোজ্য।',
      VOUCHER_NOT_DISCARDABLE: 'শুধু অনিশ্চিত প্রস্তাব বাদ দেওয়া যায়।',
      VOUCHER_ON_LEDGER: 'লেজারে এই ভাউচারটি আছে; শীঘ্রই দেখা যাবে।',
      VOUCHER_NOT_ACTIVE: 'এই ভাউচারটি চালু নেই।',
      VOUCHER_WRONG_STATUS: 'এই ভাউচারটি {{status, word}}।',
      EXCEEDS_VOUCHER_QUANTITY:
        'এই ভাউচারে মাত্র {{available, number}} বাকি আছে।',
      SUPPLIER_NOT_VERIFIED: 'প্রত্যেক সরবরাহকারীকে যাচাইকৃত হতে হবে।',
      SALE_NOT_FOUND: 'এই বিক্রিটি খুঁজে পাওয়া যায়নি।',
      SALE_WRONG_STATUS: 'এই বিক্রিটি {{status, word}}।',
      SALE_CANCEL_NOT_ALLOWED: 'আপনি এই বিক্রিটি বাতিল করতে পারবেন না।',
      INVALID_BATCHES:
        'কিছু ব্যাচ এই বিক্রিতে ব্যবহার করা যাবে না: {{problems}}',
      BATCH_NOT_FOUND: 'এই ব্যাচটি খুঁজে পাওয়া যায়নি।',
      BATCH_NOT_YOURS: '{{batch}} আপনার ব্যাচ নয়।',
      BATCH_NOT_REGISTERED: '{{batch}} এখনও নিবন্ধিত হয়নি।',
      BATCH_WRONG_INPUT:
        '{{batch}} হলো {{input}}-এর ব্যাচ, {{expected}}-এর নয়।',
      BATCH_EXPIRED: '{{batch}}-এর মেয়াদ শেষ হয়ে গেছে।',
      PRODUCED_IN_FUTURE: 'উৎপাদনের তারিখ ভবিষ্যতের হতে পারে না।',
      EXPIRES_BEFORE_PRODUCED:
        'মেয়াদ শেষের তারিখ উৎপাদনের তারিখের আগে হতে পারে না।',
      LOT_ALREADY_REGISTERED:
        'এই উপকরণের জন্য এই লট নম্বর আপনি আগেই নিবন্ধন করেছেন।',
      FARM_UPDATE_WRONG_STAGE:
        'অর্থায়ন থেকে ফসল বিক্রির জন্য প্রস্তুত হওয়া পর্যন্ত খামারের হালনাগাদ নথিভুক্ত হয়।',
      NOT_FARMERS_OFFICER: 'শুধু কৃষকের নিজের মাঠ কর্মকর্তা এটি করতে পারেন।',
      INVALID_RECORD: 'খামারের হালনাগাদটি সঠিক নয়: {{problems}}',
      FIELD_RECORD_NOT_FOUND: 'এই খামারের হালনাগাদটি খুঁজে পাওয়া যায়নি।',
      RECORD_HAS_NO_PHOTO: 'এই খামারের হালনাগাদে কোনো ছবি নেই।',
      MEASUREMENT_UNKNOWN: '{{key}} এই ধরনের হালনাগাদের পরিমাপ নয়।',
      MEASUREMENT_REQUIRED: '{{label}} দিতে হবে।',
      MEASUREMENT_NOT_A_NUMBER:
        '{{label}} একটি সংখ্যা হতে হবে, সর্বোচ্চ {{decimals, number}}টি দশমিক ঘর।',
      MEASUREMENT_BELOW_MIN: '{{label}} সর্বনিম্ন {{min, number}}-এর চেয়ে কম।',
      MEASUREMENT_ABOVE_MAX:
        '{{label}} সর্বোচ্চ {{max, number}}-এর চেয়ে বেশি।',
      LOCATION_INCOMPLETE: 'অক্ষাংশ ও দ্রাঘিমাংশ দুটোই দিন, অথবা কোনোটিই নয়।',
      COORDINATES_INVALID: 'অবস্থানটি সঠিক নয়।',
      LOCATION_OUTSIDE_BANGLADESH: 'অবস্থানটি বাংলাদেশের বাইরে।',
      LOCATION_REQUIRED: '{{recordType}}-এর জন্য অবস্থান লাগবে।',
      PHOTO_REQUIRED: '{{recordType}}-এর জন্য ছবি লাগবে।',
      PHOTO_NOT_YOURS: 'ছবিটি আপনার তোলা ও আপলোড করা হতে হবে।',
      CORRECTION_OTHER_PROJECT: 'সংশোধন একই প্রকল্পের হালনাগাদের জন্য হতে হবে।',
      OBSERVED_AT_INVALID: 'হালনাগাদের সময়টি সঠিক নয়।',
      OBSERVED_AT_FUTURE: 'হালনাগাদের সময় ভবিষ্যতের। ফোনের ঘড়ি দেখুন।',
      DUPLICATE_IN_BATCH: 'এই ব্যাচে একই হালনাগাদ দুইবার পাঠানো হয়েছে।',
      CORRECTION_CYCLE:
        'এই ব্যাচের সংশোধনগুলো একে অপরকে ঘুরেফিরে নির্দেশ করছে।',
      ENTRY_ID_REUSED:
        'এই খসড়াটি আগেই ভিন্ন তথ্য নিয়ে পাঠানো হয়েছে। নতুন হালনাগাদ শুরু করুন।',
      NOT_CONFIRMED:
        'লেজারে এখনও নিশ্চিত হয়নি। খসড়াটি রেখে দিন, পরে আবার পাঠান।',
      PHOTO_FIELD_MISSING: 'কোনো ছবি সংযুক্ত করা হয়নি।',
      PHOTO_SIZE: 'ছবি সর্বোচ্চ {{maxMb, number}} এমবি হতে পারে।',
      PHOTO_TYPE: 'ছবি JPEG, PNG বা WebP হতে হবে।',
      PHOTO_DAMAGED: 'ছবির ফাইলটি নষ্ট।',
      PHOTO_NOT_FOUND: 'এই ছবিটি খুঁজে পাওয়া যায়নি।',
      PHOTO_FILE_MISSING: 'ছবির ফাইলটি পাওয়া যাচ্ছে না।',
      TOO_MANY_PHOTOS: 'সর্বোচ্চ {{max, number}}টি ছবি।',
      SITE_NOT_FOUND: 'এই গুদামটি খুঁজে পাওয়া যায়নি।',
      SITE_NAME_EXISTS: 'এই নামে একটি গুদাম আগেই আছে।',
      WAREHOUSE_OPERATOR_INVALID: 'একজন যাচাইকৃত গুদাম পরিচালক বেছে নিন।',
      NOT_SITE_OPERATOR: 'আপনাকে কোনো গুদামে নিযুক্ত করা হয়নি।',
      NOT_ISSUING_SITE_OPERATOR:
        'শুধু যে গুদাম এটি দিয়েছে, তার পরিচালক এটি করতে পারেন।',
      NOT_STORABLE: 'তাজা ফসল সরাসরি বিক্রি হয়, গুদামে রাখা হয় না।',
      RECEIPT_NOT_FOUND: 'এই রসিদটি খুঁজে পাওয়া যায়নি।',
      RECEIPT_WRONG_STATUS: 'এই রসিদটি {{status, word}}।',
      RECEIPT_NOT_ISSUED:
        'শুধু ইস্যু করা রসিদ দিয়ে এটি করা যায়; এটি {{status, word}}।',
      RECEIPT_EXPIRED:
        'এই রসিদের মেয়াদ শেষ। আগে গুদামকে পুনরায় যাচাই করে মেয়াদ বাড়াতে হবে।',
      HANDOVER_CANCEL_NOT_ALLOWED: 'আপনি এই হস্তান্তর বাতিল করতে পারবেন না।',
      NO_HANDOVER_WAITING: 'এই রসিদে কোনো হস্তান্তর অপেক্ষায় নেই।',
      INTAKE_IN_FUTURE: 'গুদামে রাখার তারিখ ভবিষ্যতের হতে পারে না।',
      EXPIRY_IN_PAST: 'শেষ তারিখ অতীতের হতে পারে না।',
      EXPIRES_BEFORE_INTAKE: 'শেষ তারিখ গুদামে রাখার তারিখের আগে হতে পারে না।',
      CHECK_IN_FUTURE: 'পুনরায় যাচাইয়ের তারিখ ভবিষ্যতের হতে পারে না।',
      NEW_EXPIRY_NOT_LATER: 'নতুন শেষ তারিখ {{current, date}}-এর পরে হতে হবে।',
      LISTING_NOT_FOUND: 'এই তালিকাটি খুঁজে পাওয়া যায়নি।',
      LISTING_WRONG_STATUS: 'এই তালিকাটি {{status, word}}।',
      LISTING_NOT_ALLOWED:
        'শুধু অ্যাডমিন বা কৃষকের মাঠ কর্মকর্তা এটি বিক্রির তালিকায় দিতে পারেন।',
      LISTING_CANCEL_NOT_ALLOWED:
        'শুধু বিক্রেতার পক্ষ বা অ্যাডমিন এই তালিকা বাতিল করতে পারেন।',
      NOT_RECEIPT_OWNER:
        'শুধু রসিদের মালিকের পক্ষ এটি বিক্রির তালিকায় দিতে পারে।',
      NOT_PERISHABLE:
        'গুদামজাত ফসল ও মসলা তাদের গুদাম রসিদের মাধ্যমে বিক্রি হয়।',
      DEALS_PENDING:
        '{{unpaidDeals, number}}টি অনুমোদিত চুক্তি এখনও পেমেন্টের অপেক্ষায়।',
      EXCEEDS_AVAILABLE: 'মাত্র {{available, number}} পাওয়া যাচ্ছে।',
      OFFER_NOT_FOUND: 'এই প্রস্তাবটি খুঁজে পাওয়া যায়নি।',
      OFFER_WRONG_STATUS: 'এই প্রস্তাবটি {{status, word}}।',
      PAYMENT_OVERDUE: 'এই চুক্তির পেমেন্টের সময়সীমা পার হয়ে গেছে।',
      DEAL_CONFIRMING: 'এই চুক্তিটি নিশ্চিত করা হচ্ছে।',
      DELIVERY_CONFIRM_NOT_ALLOWED:
        'শুধু ক্রেতা বা হস্তান্তরকারী সরবরাহ নিশ্চিত করেন।',
      DELIVERY_ALREADY_CONFIRMED:
        '{{side, word}} এই সরবরাহ আগেই নিশ্চিত করেছেন।',
      DELIVERY_HAS_NO_PHOTO: 'এই সরবরাহের কোনো ছবি নেই।',
      REQUEST_NOT_FOUND: 'এই অনুরোধটি খুঁজে পাওয়া যায়নি।',
      REQUEST_ALREADY_CANCELLED: 'এই অনুরোধটি আগেই বাতিল করা হয়েছে।',
      VALID_UNTIL_IN_PAST: 'শেষ হওয়ার তারিখ অতীতের হতে পারে না।',
      NO_COVERAGE: 'এখনও কোনো বীমাকারী এই প্রকল্পের বীমা করেননি।',
      NOT_INSURED: 'এই প্রকল্পটি বীমা করা নয়।',
      OTHER_INSURER: 'অন্য একজন বীমাকারী এই প্রকল্পের বীমা করেছেন।',
      INSURANCE_PROJECT_STAGE:
        'ফসল মাঠে থাকা অবস্থায় বীমা প্রযোজ্য; এই প্রকল্পটি {{stage, word}}।',
      COVER_UNCHANGED: 'এগুলোই বর্তমান শর্ত।',
      COVERAGE_BELOW_APPROVED:
        '{{approvedTotal, taka}} দাবি আগেই অনুমোদিত; বীমার পরিমাণ এর কম হতে পারে না।',
      AMOUNT_NOT_POSITIVE: 'পরিমাণ শূন্যের বেশি হতে হবে।',
      DAMAGE_NOT_POSITIVE: 'ক্ষতি ০%-এর বেশি হতে হবে।',
      OCCURRED_IN_FUTURE: 'ঘটনার তারিখ ভবিষ্যতের হতে পারে না।',
      WEATHER_EVENT_NOT_FOUND: 'এই আবহাওয়ার ঘটনাটি খুঁজে পাওয়া যায়নি।',
      WEATHER_EVENT_INVALID: 'একটি নথিভুক্ত আবহাওয়ার ঘটনা বেছে নিন।',
      REGION_MISMATCH:
        'আবহাওয়ার ঘটনাটি প্রকল্পের জেলা থেকে ভিন্ন জেলায় ঘটেছে।',
      EVENT_NOT_COVERED: 'বীমায় এই ধরনের আবহাওয়ার ঘটনা অন্তর্ভুক্ত নয়।',
      ALREADY_CLAIMED: 'এই ঘটনার জন্য এই প্রকল্প আগেই দাবি করেছে।',
      EXCEEDS_COVERAGE: 'বীমার মাত্র {{remaining, taka}} বাকি আছে।',
      CLAIM_NOT_FOUND: 'এই দাবিটি খুঁজে পাওয়া যায়নি।',
      CLAIM_NOT_ALLOWED:
        'শুধু কৃষকের মাঠ কর্মকর্তা বা অ্যাডমিন দাবি করতে পারেন।',
      CLAIM_WRONG_STATUS: 'এই দাবিটি {{status, word}}।',
      REVIEW_NOT_STARTED: 'আগে এই দাবির পর্যালোচনা শুরু করুন।',
      NOT_PROJECT_INSURER:
        'শুধু প্রকল্পের বীমাকারী এই দাবি পর্যালোচনা করতে পারেন।',
      CLAIM_PHOTO_NOT_FOUND: 'এই দাবিতে এমন কোনো ছবি নেই।',
      CLAIM_HAS_NO_PHOTO: 'এই দাবিতে মূল্যায়নের কোনো ছবি নেই।',
      COST_NOT_FOUND: 'এই খরচটি খুঁজে পাওয়া যায়নি।',
      COST_PROJECT_STAGE:
        'প্রকল্প অর্থায়িত, চালু বা বিক্রির জন্য প্রস্তুত থাকলে খরচ নথিভুক্ত হয়; এটি {{stage, word}}।',
      INCURRED_IN_FUTURE: 'খরচের তারিখ ভবিষ্যতের হতে পারে না।',
      COST_ALREADY_VOIDED: 'এই খরচটি আগেই বাতিল করা হয়েছে।',
      COST_HAS_NO_PHOTO: 'এই খরচের কোনো বিলের ছবি নেই।',
      FINAL_ROUND_OPEN: 'চূড়ান্ত পর্ব খোলা আছে; খরচ বদলাতে সেটি ফেরত পাঠান।',
      ALREADY_SETTLED: 'এই প্রকল্পের হিসাব আগেই চূড়ান্ত হয়েছে।',
      ROUND_OPEN: 'এই প্রকল্পের আরেকটি অর্থ প্রদান পর্ব এখনও খোলা।',
      ROUND_WRONG_STAGE:
        'ধাপে ধাপে পর্ব চালু প্রকল্পের জন্য, চূড়ান্ত পর্ব বিক্রির জন্য প্রস্তুত প্রকল্পের জন্য।',
      NOT_STAGED: 'এই প্রকল্প একবারই, শেষে অর্থ দেয়।',
      TOO_EARLY: 'পরের অর্থ প্রদান পর্বের সময় এখনও হয়নি।',
      NOTHING_TO_DISTRIBUTE: 'ভাগ করার মতো নতুন লাভ নেই।',
      STILL_OUTSTANDING: 'চূড়ান্ত হিসাবের সব কাজ আগে শেষ করতে হবে।',
      ROUND_NOT_FOUND: 'এই অর্থ প্রদান পর্বটি খুঁজে পাওয়া যায়নি।',
      ROUND_WRONG_STATUS: 'এই অর্থ প্রদান পর্বটি {{status, word}}।',
      SAME_ACCOUNTANT:
        'যিনি পর্বটি তৈরি করেছেন, তিনি ছাড়া অন্য কেউ এটি অনুমোদন করবেন।',
      ROUND_NOT_VERIFIED:
        'এখানের হিসাব লেজারের সঙ্গে মেলে না। এই পর্বটি ফেরত পাঠান।',
      NOT_IN_ROUND: 'এই পর্বে এই ব্যক্তি অর্থ পান না।',
      ALREADY_PAID: 'এই লাইনের অর্থ আগেই দেওয়া হয়েছে।',
      LINE_NOT_VERIFIED: 'এই লাইনের পরিমাণ লেজারের সঙ্গে মেলে না।',
      PAYMENT_IN_PROGRESS: 'এই লাইনের আরেকটি পেমেন্ট নথিভুক্ত হচ্ছে।',
      PERIOD_REVERSED: 'সময়ের শেষ তার শুরুর আগে হতে পারে না।',
      PERIOD_TOO_LONG:
        'একটি সময়কাল সর্বোচ্চ {{maxDays, number}} দিন হতে পারে।',
      NO_STATEMENT: 'এই ব্যক্তির কোনো বিবরণী নেই।',
      BANK_NOT_FOUND: 'এই ব্যাংকটি খুঁজে পাওয়া যায়নি।',
      BANK_EXISTS: 'এই ব্যাংক শাখাটি আগেই নিবন্ধিত।',
      BANK_OFFICER_INVALID: 'একজন যাচাইকৃত ব্যাংক কর্মকর্তা বেছে নিন।',
      NOT_ASSIGNED_TO_BANK: 'আপনাকে কোনো ব্যাংকে নিযুক্ত করা হয়নি।',
      NO_FINISHED_PROJECTS: 'কৃষকের এখনও কোনো সম্পন্ন প্রকল্প নেই।',
      UNCHANGED: 'সংস্করণ {{version, number}}-এর পর কিছু বদলায়নি।',
      VERSION_NOT_FOUND: 'এই সংস্করণটি খুঁজে পাওয়া যায়নি।',
      NO_TRACK_RECORD: 'এই কৃষকের এখনও কোনো ট্র্যাক রেকর্ড নেই।',
      NO_ACTIVE_CONSENT: 'এই কৃষক আপনার ব্যাংককে অনুমতি দেননি।',
      NO_CONSENT_TO_WITHDRAW:
        'এই ব্যাংকের প্রত্যাহার করার মতো কোনো বর্তমান অনুমতি নেই।',
      CONSENT_NOT_FOUND: 'এই অনুমতিটি খুঁজে পাওয়া যায়নি।',
      EXPIRY_TOO_LATE:
        'অনুমতি সর্বোচ্চ এক বছর থাকে: {{latest, date}} পর্যন্ত। শেষ হলে নবায়ন করুন।',
    },
    /** One failed input check: {{field}} and, where it has one, {{limit}}. */
    rule: {
      required: '{{field}} দিতে হবে',
      notAllowed: '{{field}} এখানে দেওয়া যাবে না',
      text: '{{field}} লেখা হতে হবে',
      wholeNumber: '{{field}} পূর্ণসংখ্যা হতে হবে',
      number: '{{field}} সংখ্যা হতে হবে',
      yesNo: '{{field}} হ্যাঁ বা না হতে হবে',
      date: '{{field}} একটি তারিখ হতে হবে',
      id: '{{field}} সঠিক আইডি নয়',
      oneOf: '{{field}} অনুমোদিত বিকল্পগুলোর একটি নয়',
      min: '{{field}} কমপক্ষে {{limit, number}} হতে হবে',
      max: '{{field}} সর্বোচ্চ {{limit, number}} হতে পারে',
      minLength: '{{field}}-এ কমপক্ষে {{limit, number}}টি অক্ষর লাগবে',
      maxLength: '{{field}}-এ সর্বোচ্চ {{limit, number}}টি অক্ষর থাকতে পারে',
      format: '{{field}} সঠিক বিন্যাসে নেই',
      url: '{{field}} একটি ওয়েব ঠিকানা হতে হবে',
      list: '{{field}} একটি তালিকা হতে হবে',
      listMin: '{{field}}-এ কমপক্ষে {{limit, number}}টি থাকতে হবে',
      listMax: '{{field}}-এ সর্বোচ্চ {{limit, number}}টি থাকতে পারে',
      unique: '{{field}}-এ একই জিনিস একাধিকবার আছে',
      object: '{{field}} সঠিক নয়',
      invalid: '{{field}} সঠিক নয়',
    },
  },
  /** By notification kind: reservation.made -> reservation.made.title. */
  notifications: {
    participant: {
      registered: { title: 'নতুন নিবন্ধন যাচাইয়ের অপেক্ষায়: {{role, role}}' },
      verified: { title: 'আপনার অ্যাকাউন্ট যাচাই করা হয়েছে' },
      rejected: { title: 'আপনার নিবন্ধন গ্রহণ করা হয়নি' },
    },
    farmer: {
      assigned: { title: 'আপনার দায়িত্বে একজন কৃষক যোগ হয়েছেন' },
    },
    reservation: {
      made: {
        title: 'রিজার্ভেশন #{{reservationId}} পেমেন্ট নিশ্চিতকরণের অপেক্ষায়',
        body: '{{project}}-এ $t(units.slot, {"count": {{slots}} }); {{expiresAt, datetime}} পর্যন্ত রাখা থাকবে',
      },
      confirmed: {
        title: 'পেমেন্ট নিশ্চিত হয়েছে: আপনার স্লট দেওয়া হয়েছে',
        body: '{{project}}-এ $t(units.slot, {"count": {{slots}} })',
      },
      expired: {
        title: 'পেমেন্ট না হওয়ায় আপনার রিজার্ভেশনের মেয়াদ শেষ হয়েছে',
      },
      cancelled: { title: 'আপনার রিজার্ভেশন বাতিল হয়েছে' },
      expiring: {
        title:
          'আপনার $t(units.slot, {"count": {{slots}} })-এর রিজার্ভেশনের মেয়াদ শীঘ্রই শেষ হবে',
        body: '{{project}}: {{expiresAt, datetime}}-এর আগে পেমেন্ট করুন, নইলে স্লটগুলো ছেড়ে দেওয়া হবে',
      },
    },
    project: {
      funded: {
        title: '{{project}} পুরোপুরি অর্থায়িত: এর উপকরণ ভাউচার প্রস্তাব করুন',
      },
      active: { title: '{{project}} চালু হয়েছে' },
      'ready-for-sale': {
        title: '{{project}} চূড়ান্ত অর্থ প্রদানের জন্য প্রস্তুত',
      },
      'paid-out': { title: '{{project}}-এর অর্থ প্রদান সম্পন্ন' },
      cancelled: {
        title: '{{project}} বাতিল হয়েছে: আপনার টাকা ফেরত দেওয়া হবে',
      },
      'refunds-due': { title: '{{project}} বাতিল হয়েছে: টাকা ফেরত দিতে হবে' },
    },
    refund: {
      paid: { title: 'আপনার টাকা ফেরত দেওয়া হয়েছে', body: '{{project}}' },
    },
    voucher: {
      proposed: {
        title: 'ভাউচার অনুমোদনের অপেক্ষায়',
        body: '{{project}}-এর জন্য {{quantity, number}} {{input}}',
      },
      approved: { title: 'ভাউচার অনুমোদিত: {{quantity, number}} {{input}}' },
      rejected: {
        title: 'ভাউচার প্রত্যাখ্যাত: {{quantity, number}} {{input}}',
      },
      cancelled: { title: 'ভাউচার বাতিল: {{quantity, number}} {{input}}' },
      'inactive-soon': {
        title: '{{input}}-এর ভাউচার নিষ্ক্রিয়তার সীমার কাছাকাছি',
        body: '{{project}}: {{deadline, datetime}}-এর আগে ব্যবহার করুন',
      },
      inactive: {
        title: '{{input}}-এর ভাউচার নিষ্ক্রিয়তার সীমা পার করেছে',
        body: '{{project}}: এরপর কী হবে, অ্যাডমিন ঠিক করবেন',
      },
    },
    sale: {
      recorded: {
        title: 'উপকরণ বিক্রি #{{saleId}} নিশ্চিত করুন',
        body: '{{quantity, number}} একক, {{amount, taka}}; নিশ্চিত না হলে ৭ দিন পর বিক্রিটি বাতিল হয়ে যায়',
      },
      confirmed: { title: 'উপকরণ বিক্রি #{{saleId}} নিশ্চিত হয়েছে' },
      cancelled: { title: 'উপকরণ বিক্রি #{{saleId}} বাতিল হয়েছে' },
      expired: {
        title: 'উপকরণ বিক্রি #{{saleId}} নিশ্চিত না হওয়ায় বাতিল হয়েছে',
      },
      'confirm-due': {
        title: 'উপকরণ বিক্রি #{{saleId}} নিশ্চিত না করলে শীঘ্রই বাতিল হবে',
        body: '{{expiresAt, datetime}}-এর আগে নিশ্চিত করুন',
      },
    },
    receipt: {
      issued: {
        title: 'গুদাম রসিদ দেওয়া হয়েছে',
        body: '{{quantity, number}} {{produce}} গুদামে রাখা হয়েছে',
      },
      expiring: {
        title:
          '{{quantity, number}} {{produce}} গুদামে রাখার মেয়াদ {{expiresOn, date}}-এ শেষ হবে',
        body: 'রসিদ পুনরায় যাচাই করে মেয়াদ বাড়ান, বিক্রি করুন, অথবা পণ্য তুলে নিন',
      },
    },
    handover: {
      offered: {
        title: 'ফেরত কেনার প্রস্তাব এসেছে: রসিদটি গ্রহণ বা প্রত্যাখ্যান করুন',
      },
      cancelled: {
        title: 'ফেরত কেনার প্রস্তাব প্রত্যাহার বা প্রত্যাখ্যান করা হয়েছে',
      },
      accepted: { title: 'WeGro ফেরত কেনা গ্রহণ করেছে' },
    },
    offer: {
      made: {
        title: 'প্রস্তাব #{{offerId}} অনুমোদনের অপেক্ষায়',
        body: 'তালিকা #{{listingId}}-এ প্রতিটি {{unitPrice, taka}} দরে {{quantity, number}}',
      },
      approved: {
        title: 'আপনার প্রস্তাব অনুমোদিত হয়েছে',
        body: '{{paymentDueAt, datetime}}-এর মধ্যে পেমেন্ট করুন, নইলে চুক্তিটি বাতিল হবে',
      },
      rejected: { title: 'আপনার প্রস্তাব প্রত্যাখ্যাত হয়েছে' },
    },
    deal: {
      'awaiting-payment': {
        title: 'চুক্তি #{{offerId}}: ক্রেতার পেমেন্ট এলে নিশ্চিত করুন',
      },
      'payment-due': {
        title: 'চুক্তি #{{offerId}}-এর পেমেন্টের সময় শীঘ্রই শেষ হবে',
        body: '{{paymentDueAt, datetime}}-এর মধ্যে {{amount, taka}}, নইলে চুক্তিটি বাতিল হবে',
      },
      cancelled: { title: 'আপনার চুক্তি বাতিল হয়েছে' },
      expired: {
        title: 'আপনার চুক্তি বাতিল হয়েছে: সময়মতো পেমেন্ট নিশ্চিত হয়নি',
      },
      paid: { title: 'আপনার পেমেন্ট নিশ্চিত হয়েছে' },
      deliver: {
        title:
          'চুক্তি #{{offerId}}-এর পেমেন্ট হয়েছে: পণ্য হস্তান্তর করে সরবরাহ নিশ্চিত করুন',
      },
      delivered: {
        title: 'চুক্তি #{{offerId}}-এর পণ্য সরবরাহ হয়েছে',
        body: '{{amount, taka}}',
      },
    },
    claim: {
      opened: { title: 'আপনার বীমা করা একটি প্রকল্পে দাবি করা হয়েছে' },
      approved: {
        title: 'বীমা দাবি অনুমোদিত: {{amount, taka}}',
        body: '{{project}}',
      },
      rejected: { title: 'বীমা দাবি প্রত্যাখ্যাত', body: '{{project}}' },
    },
    round: {
      prepared: {
        title: 'অর্থ প্রদান পর্ব #{{roundId}}-এর দ্বিতীয় অনুমোদন দরকার',
      },
      rejected: { title: 'অর্থ প্রদান পর্ব #{{roundId}} ফেরত পাঠানো হয়েছে' },
      approved: {
        title:
          'অর্থ প্রদান পর্ব #{{roundId}} অনুমোদিত: প্রতিটি লাইনের অর্থ দিয়ে নথিভুক্ত করুন',
      },
    },
    payout: {
      paid: { title: 'আপনাকে {{amount, taka}} দেওয়া হয়েছে' },
    },
    'track-record': {
      published: {
        title:
          'আপনার ট্র্যাক রেকর্ডের সংস্করণ {{version, number}} প্রকাশিত হয়েছে',
      },
      viewed: { title: '{{bank}} আপনার ট্র্যাক রেকর্ড দেখেছে' },
    },
    consent: {
      granted: { title: 'আপনি {{bank}}-কে অনুমতি দিয়েছেন' },
      revoked: { title: 'আপনি {{bank}}-এর অনুমতি প্রত্যাহার করেছেন' },
      expiring: {
        title: '{{bank}}-এর অনুমতির মেয়াদ শীঘ্রই শেষ হবে',
        body: '{{expiresAt, datetime}}-এ শেষ হবে; কৃষক রাজি হলে নবায়ন করুন',
      },
    },
    'bank-account': {
      submitted: { title: 'ব্যাংকের তথ্য যাচাইয়ের অপেক্ষায়' },
      verified: {
        title: 'আপনার ব্যাংকের তথ্য যাচাই হয়েছে: অর্থ সেখানেই যাবে',
      },
      rejected: {
        title: 'আপনার নতুন ব্যাংকের তথ্য গ্রহণ করা হয়নি',
        body: '{{reason}}',
      },
    },
    system: {
      'node-unreachable': {
        title: 'ব্লকচেইন নোডে সংযোগ করা যাচ্ছে না',
        body: '{{error}}',
      },
      'indexer-behind': {
        title: 'ডেটাবেস লেজারের চেয়ে পিছিয়ে পড়ছে',
        body: '{{lag, number}} ব্লক পিছিয়ে (অনুমোদিত {{allowed, number}}); পাতায় পুরোনো তথ্য দেখা যেতে পারে',
      },
      'indexer-failing': {
        title: 'লেজারের ঘটনা ডেটাবেসে কপি করা বারবার ব্যর্থ হচ্ছে',
        body: 'পরপর {{failures, number}} বার ব্যর্থ: {{error}}',
      },
      resolved: {
        title: 'সমাধান হয়েছে: {{problem, word}}',
        body: '{{since, datetime}} থেকে',
      },
    },
  },
  nav: {
    dashboard: 'ড্যাশবোর্ড',
    projects: 'প্রকল্প',
    myProjects: 'আমার প্রকল্প',
    holdings: 'আমার বিনিয়োগ',
    people: 'ব্যক্তিরা',
    farmers: 'কৃষকেরা',
    farmUpdates: 'খামারের হালনাগাদ',
    vouchers: 'ভাউচার',
    vouchersSales: 'ভাউচার ও বিক্রি',
    batches: 'ব্যাচ',
    warehouse: 'গুদাম',
    receipts: 'রসিদ',
    marketplace: 'বাজার',
    offers: 'আমার প্রস্তাব',
    requests: 'চাহিদা',
    insurance: 'বীমা',
    payouts: 'অর্থ প্রদান',
    statement: 'বিবরণী',
    trackRecords: 'ট্র্যাক রেকর্ড',
    trackRecord: 'ট্র্যাক রেকর্ড',
    catalog: 'ক্যাটালগ',
    audit: 'ইতিহাস ও নিরীক্ষা',
    system: 'সিস্টেম',
    status: 'আমার নিবন্ধন',
    account: 'আমার অ্যাকাউন্ট',
    notifications: 'বিজ্ঞপ্তি',
  },
  shell: {
    menu: 'প্রধান মেনু',
    more: 'আরও',
    moreTitle: 'আরও পাতা',
    account: 'অ্যাকাউন্ট',
    signOut: 'সাইন আউট',
    skipToContent: 'মূল অংশে যান',
  },
  states: {
    loading: 'লোড হচ্ছে…',
    empty: 'এখনও এখানে কিছু নেই',
    retry: 'আবার চেষ্টা করুন',
    reference: 'রেফারেন্স: {{id}}',
    comingSoon: 'এই পাতাটি শীঘ্রই আসছে',
    comingSoonHint: 'এটি তৈরি হচ্ছে; মেনুতে এর জায়গা দেখানো আছে।',
  },
  pages: {
    notFound: 'পাতাটি পাওয়া যায়নি',
    notFoundHint: 'ঠিকানাটি হয়তো ভুল লেখা হয়েছে, অথবা পাতাটি সরানো হয়েছে।',
    noAccess: 'আপনার ভূমিকার জন্য নয়',
    noAccessHint:
      'এই পাতাটি অন্য ভূমিকার জন্য। আপনি কী খুলতে পারেন, তা মেনুতে দেখানো আছে।',
    home: 'আমার মূল পাতায় যান',
  },
  signIn: {
    title: 'WeGro-তে সাইন ইন করুন',
    demoTitle: 'ডেমো: একটি ভূমিকা বেছে নিন',
    demoHint: 'প্রতিটি ভূমিকা একটি তৈরি ডেমো অ্যাকাউন্ট দিয়ে সাইন ইন করে।',
    demoOff: 'এই সার্ভারে ডেমো সাইন ইন নেই।',
    passwordComing: 'ফোন নম্বর ও পাসওয়ার্ড দিয়ে সাইন ইন শীঘ্রই আসছে।',
    signingIn: 'সাইন ইন হচ্ছে…',
  },
  statusPage: {
    pendingTitle: 'আপনার নিবন্ধন যাচাই করা হচ্ছে',
    pendingHint:
      'নিবন্ধন যাচাই হলে আপনি WeGro ব্যবহার করতে পারবেন। আমরা আপনাকে জানাব।',
    role: 'নিবন্ধিত ভূমিকা',
  },
  changePassword: {
    title: 'আপনার অস্থায়ী পাসওয়ার্ড বদলান',
    hint: 'আপনি একটি অস্থায়ী পাসওয়ার্ড দিয়ে সাইন ইন করেছেন। এটি বদলানোর ফর্ম শীঘ্রই আসছে।',
  },
  formats: {
    title: 'ভাষা ও বিন্যাস',
    amount: 'টাকার পরিমাণ',
    shortAmount: 'সংক্ষিপ্ত পরিমাণ',
    count: 'সংখ্যা',
    date: 'তারিখ',
    dateTime: 'তারিখ ও সময়',
    relative: 'কত আগে',
    error: 'ত্রুটি',
    notification: 'বিজ্ঞপ্তি',
  },
};
