import { hasContactDetails } from './contact-details';

describe('hasContactDetails', () => {
  it.each([
    '01711000001',
    'Call 01711-000-001 today',
    '017 1100 0001',
    '+8801711000001',
    '8801711000001',
    '০১৭১১০০০০০১',
    'ফোন: ০১৭১১-০০০০০১',
    '1711000001',
    'rahim@example.com',
    'see https://example.com/rahim',
    'www.rahimtraders.com',
    'rahimtraders.com.bd',
    'wa.me/8801711000001',
    'on WhatsApp',
    'whats app me',
    'find us on Facebook',
    'imo number given on request',
    'হোয়াটসঅ্যাপে জানান',
  ])('finds a way to reach someone in %s', (text) => {
    expect(hasContactDetails(text)).toBe(true);
  });

  it.each([
    'Dry, bagged in 50 kg sacks.',
    'Harvested 2026-10-20, moisture 12.5%',
    '2026-10-20 to 2026-11-20',
    '500 kg at 13 percent moisture',
    '100 bags, 2 torn; 1 kg short',
    'শুকনো, ৫০ কেজির বস্তায়',
    'Lot 12345',
    'Grade A. Imported seed. Good condition.',
  ])('lets %s through', (text) => {
    expect(hasContactDetails(text)).toBe(false);
  });
});
