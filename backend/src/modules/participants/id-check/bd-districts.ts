/**
 * The 64 districts of Bangladesh with their BBS geo-codes (the code the old
 * 13- and 17-digit NIDs start with). Keyed by a stable upper-case code used
 * by the API and the officer's dropdown.
 */
export const BD_DISTRICTS = {
  // Barishal
  BARGUNA: { geo: '04', name: 'Barguna', division: 'Barishal' },
  BARISHAL: { geo: '06', name: 'Barishal', division: 'Barishal' },
  BHOLA: { geo: '09', name: 'Bhola', division: 'Barishal' },
  JHALOKATI: { geo: '42', name: 'Jhalokati', division: 'Barishal' },
  PATUAKHALI: { geo: '78', name: 'Patuakhali', division: 'Barishal' },
  PIROJPUR: { geo: '79', name: 'Pirojpur', division: 'Barishal' },
  // Chattogram
  BANDARBAN: { geo: '03', name: 'Bandarban', division: 'Chattogram' },
  BRAHMANBARIA: { geo: '12', name: 'Brahmanbaria', division: 'Chattogram' },
  CHANDPUR: { geo: '13', name: 'Chandpur', division: 'Chattogram' },
  CHATTOGRAM: { geo: '15', name: 'Chattogram', division: 'Chattogram' },
  CUMILLA: { geo: '19', name: 'Cumilla', division: 'Chattogram' },
  COXS_BAZAR: { geo: '22', name: "Cox's Bazar", division: 'Chattogram' },
  FENI: { geo: '30', name: 'Feni', division: 'Chattogram' },
  KHAGRACHHARI: { geo: '46', name: 'Khagrachhari', division: 'Chattogram' },
  LAKSHMIPUR: { geo: '51', name: 'Lakshmipur', division: 'Chattogram' },
  NOAKHALI: { geo: '75', name: 'Noakhali', division: 'Chattogram' },
  RANGAMATI: { geo: '84', name: 'Rangamati', division: 'Chattogram' },
  // Dhaka
  DHAKA: { geo: '26', name: 'Dhaka', division: 'Dhaka' },
  FARIDPUR: { geo: '29', name: 'Faridpur', division: 'Dhaka' },
  GAZIPUR: { geo: '33', name: 'Gazipur', division: 'Dhaka' },
  GOPALGANJ: { geo: '35', name: 'Gopalganj', division: 'Dhaka' },
  KISHOREGANJ: { geo: '48', name: 'Kishoreganj', division: 'Dhaka' },
  MADARIPUR: { geo: '54', name: 'Madaripur', division: 'Dhaka' },
  MANIKGANJ: { geo: '56', name: 'Manikganj', division: 'Dhaka' },
  MUNSHIGANJ: { geo: '59', name: 'Munshiganj', division: 'Dhaka' },
  NARAYANGANJ: { geo: '67', name: 'Narayanganj', division: 'Dhaka' },
  NARSINGDI: { geo: '68', name: 'Narsingdi', division: 'Dhaka' },
  RAJBARI: { geo: '82', name: 'Rajbari', division: 'Dhaka' },
  SHARIATPUR: { geo: '86', name: 'Shariatpur', division: 'Dhaka' },
  TANGAIL: { geo: '93', name: 'Tangail', division: 'Dhaka' },
  // Khulna
  BAGERHAT: { geo: '01', name: 'Bagerhat', division: 'Khulna' },
  CHUADANGA: { geo: '18', name: 'Chuadanga', division: 'Khulna' },
  JASHORE: { geo: '41', name: 'Jashore', division: 'Khulna' },
  JHENAIDAH: { geo: '44', name: 'Jhenaidah', division: 'Khulna' },
  KHULNA: { geo: '47', name: 'Khulna', division: 'Khulna' },
  KUSHTIA: { geo: '50', name: 'Kushtia', division: 'Khulna' },
  MAGURA: { geo: '55', name: 'Magura', division: 'Khulna' },
  MEHERPUR: { geo: '57', name: 'Meherpur', division: 'Khulna' },
  NARAIL: { geo: '65', name: 'Narail', division: 'Khulna' },
  SATKHIRA: { geo: '87', name: 'Satkhira', division: 'Khulna' },
  // Mymensingh
  JAMALPUR: { geo: '39', name: 'Jamalpur', division: 'Mymensingh' },
  MYMENSINGH: { geo: '61', name: 'Mymensingh', division: 'Mymensingh' },
  NETROKONA: { geo: '72', name: 'Netrokona', division: 'Mymensingh' },
  SHERPUR: { geo: '89', name: 'Sherpur', division: 'Mymensingh' },
  // Rajshahi
  BOGURA: { geo: '10', name: 'Bogura', division: 'Rajshahi' },
  JOYPURHAT: { geo: '38', name: 'Joypurhat', division: 'Rajshahi' },
  NAOGAON: { geo: '64', name: 'Naogaon', division: 'Rajshahi' },
  NATORE: { geo: '69', name: 'Natore', division: 'Rajshahi' },
  CHAPAI_NAWABGANJ: {
    geo: '70',
    name: 'Chapai Nawabganj',
    division: 'Rajshahi',
  },
  PABNA: { geo: '76', name: 'Pabna', division: 'Rajshahi' },
  RAJSHAHI: { geo: '81', name: 'Rajshahi', division: 'Rajshahi' },
  SIRAJGANJ: { geo: '88', name: 'Sirajganj', division: 'Rajshahi' },
  // Rangpur
  DINAJPUR: { geo: '27', name: 'Dinajpur', division: 'Rangpur' },
  GAIBANDHA: { geo: '32', name: 'Gaibandha', division: 'Rangpur' },
  KURIGRAM: { geo: '49', name: 'Kurigram', division: 'Rangpur' },
  LALMONIRHAT: { geo: '52', name: 'Lalmonirhat', division: 'Rangpur' },
  NILPHAMARI: { geo: '73', name: 'Nilphamari', division: 'Rangpur' },
  PANCHAGARH: { geo: '77', name: 'Panchagarh', division: 'Rangpur' },
  RANGPUR: { geo: '85', name: 'Rangpur', division: 'Rangpur' },
  THAKURGAON: { geo: '94', name: 'Thakurgaon', division: 'Rangpur' },
  // Sylhet
  HABIGANJ: { geo: '36', name: 'Habiganj', division: 'Sylhet' },
  MOULVIBAZAR: { geo: '58', name: 'Moulvibazar', division: 'Sylhet' },
  SUNAMGANJ: { geo: '90', name: 'Sunamganj', division: 'Sylhet' },
  SYLHET: { geo: '91', name: 'Sylhet', division: 'Sylhet' },
} as const;

export type DistrictCode = keyof typeof BD_DISTRICTS;

export const DISTRICT_CODES = Object.keys(BD_DISTRICTS) as DistrictCode[];

/** Geo-code -> district, built once: O(1) lookups. */
export const DISTRICT_BY_GEO: ReadonlyMap<string, DistrictCode> = new Map(
  DISTRICT_CODES.map((code) => [BD_DISTRICTS[code].geo, code]),
);

export function isDistrictCode(value: unknown): value is DistrictCode {
  return typeof value === 'string' && Object.hasOwn(BD_DISTRICTS, value);
}
