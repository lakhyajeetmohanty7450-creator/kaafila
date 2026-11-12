import bcrypt from 'bcryptjs';
import { queryOne, transaction } from '../config/pg.js';
import { ensureAchievementCatalog } from '../utils/achievements.js';
import { computeLineStringDistanceKm } from '../utils/geo.js';
import { computeRiderRank } from '../utils/ranking.js';

export async function seedDemoDataIfEmpty({ force = false } = {}) {
  const existingRow = await queryOne('SELECT COUNT(*)::int AS cnt FROM organisations');
  const existingOrgs = existingRow?.cnt || 0;
  if (existingOrgs > 0 && !force) {
    await ensureAchievementCatalog();
    return { seeded: false, reason: 'Database already contains organisations.' };
  }

  const demoPasswordHash = await bcrypt.hash('DemoPassword123!', 12);

  return transaction(async (tx) => {
    if (force) {
      await tx.query('DELETE FROM kafila_groups WHERE is_demo = TRUE');
      await tx.query('DELETE FROM reviews WHERE is_demo = TRUE');
      await tx.query('DELETE FROM rides WHERE is_demo = TRUE');
      await tx.query('DELETE FROM organisations WHERE is_demo = TRUE');
      await tx.query('DELETE FROM rider_profiles WHERE is_demo = TRUE');
      await tx.query("DELETE FROM users WHERE LOWER(email) LIKE '%@demo.kaafila.in'");
    }

    // 1. Seed Full Phase 4 Achievement Catalog
    await ensureAchievementCatalog(tx);

    // 2. Seed Demo Riders (for Leaderboard Preview & Demo Reviews)
  const demoRiderSpecs = [
    {
      fullName: 'Vikramaditya Rana (Demo)',
      email: 'vikram.rana@demo.kaafila.in',
      handle: 'vikram_summit_demo',
      homeCity: 'Manali, HP',
      primaryMotorcycle: 'Royal Enfield Himalayan 450',
      ridingExperience: 'expedition_veteran',
      verifiedKilometres: 22480,
      completedExpeditions: 14,
      bio: 'Demo profile: High-altitude marshal across Ladakh, Zanskar and Spiti circuits.',
      badges: [
        { code: 'HIMALAYAN_LEGEND_20K', title: 'Summit Vanguard', awardedAt: new Date('2026-08-15') },
        { code: 'HIGH_PASS_5000', title: '5,000m Pass Conqueror', awardedAt: new Date('2025-07-10') },
      ],
    },
    {
      fullName: 'Meera Thapa (Demo)',
      email: 'meera.thapa@demo.kaafila.in',
      handle: 'meera_ridges_demo',
      homeCity: 'Dehradun, UK',
      primaryMotorcycle: 'KTM 390 Adventure',
      ridingExperience: 'expedition_veteran',
      verifiedKilometres: 13840,
      completedExpeditions: 9,
      bio: 'Demo profile: Eastern Himalayan explorer focused on Sikkim & Arunachal passes.',
      badges: [{ code: 'HIGH_PASS_5000', title: '5,000m Pass Conqueror', awardedAt: new Date('2026-05-20') }],
    },
    {
      fullName: 'Kabir Gill (Demo)',
      email: 'kabir.gill@demo.kaafila.in',
      handle: 'kabir_throttle_demo',
      homeCity: 'Chandigarh',
      primaryMotorcycle: 'BMW F 850 GS',
      ridingExperience: 'advanced',
      verifiedKilometres: 7420,
      completedExpeditions: 5,
      bio: 'Demo profile: Long-range dual-sport rider mapping winter Spiti routes.',
      badges: [{ code: 'SPITI_SURVIVOR', title: 'Spiti Canyon Runner', awardedAt: new Date('2026-06-11') }],
    },
    {
      fullName: 'Ananya Deshmukh (Demo)',
      email: 'ananya.d@demo.kaafila.in',
      handle: 'ananya_nomad_demo',
      homeCity: 'Pune, MH',
      primaryMotorcycle: 'Triumph Scrambler 400X',
      ridingExperience: 'intermediate',
      verifiedKilometres: 3150,
      completedExpeditions: 3,
      bio: 'Demo profile: Weekend Western Ghats rider transitioning to high-altitude passes.',
      badges: [{ code: 'FIRST_KAAFILA', title: 'First Kaafila', awardedAt: new Date('2026-07-02') }],
    },
    {
      fullName: 'Tenzin Norbu (Demo)',
      email: 'tenzin.n@demo.kaafila.in',
      handle: 'tenzin_pass_demo',
      homeCity: 'Leh, Ladakh',
      primaryMotorcycle: 'Hero XPulse 200 4V Rally',
      ridingExperience: 'intermediate',
      verifiedKilometres: 960,
      completedExpeditions: 1,
      bio: 'Demo profile: Local Changthang trail rider and gravel enthusiast.',
      badges: [{ code: 'FIRST_KAAFILA', title: 'First Kaafila', awardedAt: new Date('2026-09-10') }],
    },
  ];

  const riderUsers = [];
  for (const spec of demoRiderSpecs) {
    const userRow = await tx.queryOne(
      `INSERT INTO users (full_name, email, password_hash, role, city)
       VALUES ($1, $2, $3, 'rider', $4)
       RETURNING *`,
      [spec.fullName, spec.email.toLowerCase(), demoPasswordHash, spec.homeCity || '']
    );
    const rank = computeRiderRank(
      spec.verifiedKilometres || 0,
      spec.completedExpeditions || 0,
      (spec.badges || []).length
    );
    await tx.queryOne(
      `INSERT INTO rider_profiles
         (user_id, handle, home_city, primary_motorcycle, riding_experience,
          verified_kilometres, completed_expeditions, rank, bio, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
       RETURNING *`,
      [
        userRow.id,
        spec.handle,
        spec.homeCity || '',
        spec.primaryMotorcycle || '',
        spec.ridingExperience || 'beginner',
        spec.verifiedKilometres || 0,
        spec.completedExpeditions || 0,
        rank,
        spec.bio || '',
      ]
    );
    for (const badge of spec.badges || []) {
      await tx.query(
        `INSERT INTO rider_achievements (user_id, achievement_code, title, awarded_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, achievement_code) DO NOTHING`,
        [userRow.id, String(badge.code).toUpperCase(), badge.title, badge.awardedAt || new Date()]
      );
    }
    riderUsers.push({ ...userRow, _id: userRow.id });
  }

  // 3. Seed Demo Organisations
  const demoOrgSpecs = [
    {
      ownerEmail: 'org.karakoram@demo.kaafila.in',
      ownerName: 'Arjun Negi (Demo)',
      name: 'Karakoram Throttle Co.',
      slug: 'karakoram-throttle-co',
      location: { city: 'Leh', state: 'Ladakh', region: 'Ladakh', country: 'India' },
      operatingRegions: ['Ladakh', 'Zanskar', 'Nubra Valley'],
      shortDescription:
        'Demo listing: High-altitude motorcycle expeditions across Umling La, Pangong Tso, and Nubra with medical oxygen & 4x4 backup.',
      about:
        'DEMO ORGANISATION LISTING: Karakoram Throttle Co. illustrates how a verified Ladakh-based touring outfit presents its fleet, high-altitude medical preparedness, accommodation standards, and day-by-day route itineraries on KAAFILA.',
      logoUrl: '/images/expedition-ladakh.png',
      coverImageUrl: '/images/hero-himalaya.png',
      officialWebsite: 'https://example.com/demo-karakoram-throttle',
      bookingUrl: 'https://example.com/demo-karakoram-throttle/book',
      foundedYear: 2018,
      verificationStatus: 'pending', // Demo listings are never marked as verified real businesses
      facilities: {
        accommodation: {
          available: true,
          summary: 'Heated Ladakhi boutique homestays & alpine glamping domes at Pangong & Hanle.',
          types: ['Boutique Homestays', 'Alpine Tents', 'Expedition Lodges'],
        },
        food: {
          available: true,
          summary: 'Hot breakfast & dinner daily with high-altitude hydration soups and energy packs.',
          dietaryOptions: ['Vegetarian', 'Non-Vegetarian', 'Jain on Request'],
        },
        bikeRental: {
          available: true,
          summary: 'BS6 Himalayan 450 & 411 fleet serviced before every departure with pannier racks.',
          fleetModels: ['Royal Enfield Himalayan 450', 'Royal Enfield Himalayan 411', 'Hero XPulse 200 4V'],
        },
        medicalAndEmergency: {
          oxygenSupport: true,
          backupVehicle: true,
          certifiedMechanic: true,
          satelliteComm: true,
          firstAidKit: true,
          summary: '4x4 Isuzu D-Max sweep vehicle, portable oxygen cylinders, pulse oximeters & Garmin inReach.',
        },
      },
      reviews: [
        {
          author: riderUsers[0]._id,
          rating: 5,
          title: 'Demo Review: Flawless Umling La support',
          comment: 'Sample demo review showcasing how verified expedition participants rate medical support and bike prep.',
        },
        {
          author: riderUsers[2]._id,
          rating: 5,
          title: 'Demo Review: Well-paced acclimatisation',
          comment: 'Sample demo review highlighting two-night Leh acclimatisation and strong mechanic crew.',
        },
      ],
    },
    {
      ownerEmail: 'org.spiti@demo.kaafila.in',
      ownerName: 'Rohan Thakur (Demo)',
      name: 'Spiti Ridge Outlaws',
      slug: 'spiti-ridge-outlaws',
      location: { city: 'Manali', state: 'Himachal Pradesh', region: 'Spiti Valley', country: 'India' },
      operatingRegions: ['Spiti Valley', 'Kinnaur', 'Lahaul'],
      shortDescription:
        'Demo listing: Technical gravel & cold-desert expeditions through Kinnaur, Pin Valley, Kaza, and Kunzum La.',
      about:
        'DEMO ORGANISATION LISTING: Spiti Ridge Outlaws demonstrates a Himachal Pradesh touring operator specialising in small-batch 10-rider convoys across the Hindustan-Tibet cliff roads and high-altitude Buddhist valleys.',
      logoUrl: '/images/expedition-spiti.png',
      coverImageUrl: '/images/expedition-spiti.png',
      officialWebsite: 'https://example.com/demo-spiti-ridge',
      bookingUrl: 'https://example.com/demo-spiti-ridge/book',
      foundedYear: 2020,
      verificationStatus: 'pending', // Demo listings are never marked as verified real businesses
      facilities: {
        accommodation: {
          available: true,
          summary: 'Stone-built Spitian mudhouses and solar-heated lodges in Kaza, Tabo & Chitkul.',
          types: ['Spitian Homestays', 'Heritage Mudhouses', 'Mountain Inns'],
        },
        food: {
          available: true,
          summary: 'Local Kinnauri & Spitian meals plus trailside hot chai and packed trail rations.',
          dietaryOptions: ['Vegetarian', 'Vegan Friendly', 'High-Protein'],
        },
        bikeRental: {
          available: true,
          summary: 'Adventure-prepped Himalayan 450 & KTM 390 Adventure with bash plates and handguards.',
          fleetModels: ['Royal Enfield Himalayan 450', 'KTM 390 Adventure'],
        },
        medicalAndEmergency: {
          oxygenSupport: true,
          backupVehicle: true,
          certifiedMechanic: true,
          satelliteComm: false,
          firstAidKit: true,
          summary: 'Dedicated luggage & sweep camper, trauma kit, oxygen cans, and lead road captain.',
        },
      },
      reviews: [
        {
          author: riderUsers[1]._id,
          rating: 5,
          title: 'Demo Review: Unmatched gravel briefings',
          comment: 'Sample demo review praising daily route briefings and suspension setup help before Kunzum La.',
        },
      ],
    },
    {
      ownerEmail: 'org.sikkim@demo.kaafila.in',
      ownerName: 'Karma Bhutia (Demo)',
      name: 'Eastern Cloudlines Moto',
      slug: 'eastern-cloudlines-moto',
      location: { city: 'Gangtok', state: 'Sikkim', region: 'Sikkim', country: 'India' },
      operatingRegions: ['Sikkim', 'Kalimpong', 'Arunachal Pradesh'],
      shortDescription:
        'Demo listing: Mist-wrapped hairpin circuits across Old Silk Route, Zuluk, Gurudongmar & Tawang.',
      about:
        'DEMO ORGANISATION LISTING: Eastern Cloudlines Moto showcases an Eastern Himalayan operator managing Inner Line Permits, wet-weather monsoon riding gear, and borderland pass logistics.',
      logoUrl: '/images/community-camp.png',
      coverImageUrl: '/images/community-camp.png',
      officialWebsite: 'https://example.com/demo-eastern-cloudlines',
      bookingUrl: 'https://example.com/demo-eastern-cloudlines/book',
      foundedYear: 2019,
      verificationStatus: 'pending', // Demo listings are never marked as verified real businesses
      facilities: {
        accommodation: {
          available: true,
          summary: 'Timber mountain cottages in Zuluk, Lachen, and Lachung with electric blankets.',
          types: ['Timber Cottages', 'Eco Lodges'],
        },
        food: {
          available: true,
          summary: 'Warm Himalayan thukpa, momos, and organic Sikkimese farm-to-table dinners.',
          dietaryOptions: ['Vegetarian', 'Non-Vegetarian'],
        },
        bikeRental: {
          available: true,
          summary: 'Scram 411, Himalayan 450, and dual-sport tyres optimised for wet tarmac & slush.',
          fleetModels: ['Royal Enfield Himalayan 450', 'Royal Enfield Scram 411'],
        },
        medicalAndEmergency: {
          oxygenSupport: true,
          backupVehicle: true,
          certifiedMechanic: true,
          satelliteComm: false,
          firstAidKit: true,
          summary: 'Restricted Area Permit handling, backup SUV, oxygen concentrator in Lachen, and first-aid lead.',
        },
      },
      reviews: [
        {
          author: riderUsers[3]._id,
          rating: 4,
          title: 'Demo Review: Seamless permit handling',
          comment: 'Sample demo review noting smooth Inner Line Permit processing for Zuluk & Nathu La.',
        },
      ],
    },
    {
      ownerEmail: 'org.zanskar@demo.kaafila.in',
      ownerName: 'Stanzin Dorje (Demo)',
      name: 'Zanskar Ridge Expeditions',
      slug: 'zanskar-ridge-expeditions',
      location: { city: 'Kargil', state: 'Ladakh', region: 'Zanskar', country: 'India' },
      operatingRegions: ['Zanskar', 'Suru Valley', 'Shinku La'],
      shortDescription:
        'Demo listing: Newly onboarded Zanskar & Shinku La expedition specialist awaiting first verified rider reviews.',
      about:
        'DEMO ORGANISATION LISTING: Zanskar Ridge Expeditions demonstrates a newly registered organisation with zero reviews yet—showing how KAAFILA omits star ratings until genuine rider reviews are submitted.',
      logoUrl: '/images/expedition-ladakh.png',
      coverImageUrl: '/images/expedition-ladakh.png',
      officialWebsite: 'https://example.com/demo-zanskar-ridge',
      bookingUrl: 'https://example.com/demo-zanskar-ridge/book',
      foundedYear: 2024,
      verificationStatus: 'pending',
      facilities: {
        accommodation: {
          available: true,
          summary: 'Riverside basecamps in Padum and Rangdum monastery guesthouses.',
          types: ['Basecamp Tents', 'Guesthouses'],
        },
        food: {
          available: true,
          summary: 'Hearty camp kitchen meals and hot butter tea stops.',
          dietaryOptions: ['Vegetarian', 'Non-Vegetarian'],
        },
        bikeRental: {
          available: true,
          summary: 'Lightweight trail-prepped XPulse 200 4V & Himalayan 450 rentals.',
          fleetModels: ['Hero XPulse 200 4V', 'Royal Enfield Himalayan 450'],
        },
        medicalAndEmergency: {
          oxygenSupport: true,
          backupVehicle: true,
          certifiedMechanic: false,
          satelliteComm: false,
          firstAidKit: true,
          summary: 'Backup utility van with oxygen canisters and trauma kit.',
        },
      },
      reviews: [], // Intentionally 0 reviews to demonstrate conditional rating rendering
    },
  ];

  const createdOrgs = [];
  for (const orgSpec of demoOrgSpecs) {
    const ownerRow = await tx.queryOne(
      `INSERT INTO users (full_name, email, password_hash, role, city)
       VALUES ($1, $2, $3, 'organisation', $4)
       RETURNING *`,
      [orgSpec.ownerName, orgSpec.ownerEmail.toLowerCase(), demoPasswordHash, orgSpec.location?.city || '']
    );

    let ratingAverage = 0;
    const reviewCount = orgSpec.reviews.length;
    if (reviewCount > 0) {
      const sum = orgSpec.reviews.reduce((acc, r) => acc + r.rating, 0);
      ratingAverage = Number((sum / reviewCount).toFixed(1));
    }

    const orgRow = await tx.queryOne(
      `INSERT INTO organisations
         (owner_id, name, slug, location, operating_regions, short_description, about,
          logo_url, cover_image_url, official_website, booking_url, founded_year,
          verification_status, is_verified, facilities, rating_average, review_count, is_demo)
       VALUES ($1, $2, $3, $4::jsonb, $5::text[], $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16, $17, TRUE)
       RETURNING *`,
      [
        ownerRow.id,
        orgSpec.name,
        orgSpec.slug,
        JSON.stringify(orgSpec.location || {}),
        orgSpec.operatingRegions || [],
        orgSpec.shortDescription || '',
        orgSpec.about || '',
        orgSpec.logoUrl || '',
        orgSpec.coverImageUrl || '',
        orgSpec.officialWebsite || '',
        orgSpec.bookingUrl || '',
        orgSpec.foundedYear || null,
        orgSpec.verificationStatus || 'pending',
        orgSpec.verificationStatus === 'verified',
        JSON.stringify(orgSpec.facilities || {}),
        ratingAverage,
        reviewCount,
      ]
    );

    await tx.query(
      `INSERT INTO organisation_members (organisation_id, user_id, member_role, status)
       VALUES ($1, $2, 'owner', 'active')`,
      [orgRow.id, ownerRow.id]
    );

    for (const rev of orgSpec.reviews) {
      await tx.query(
        `INSERT INTO reviews (organisation_id, author_id, rating, title, comment, is_verified_participant, is_demo)
         VALUES ($1, $2, $3, $4, $5, TRUE, TRUE)`,
        [orgRow.id, rev.author, rev.rating, rev.title || '', rev.comment || '']
      );
    }

    createdOrgs.push({ ...orgRow, _id: orgRow.id, owner: ownerRow.id });
  }

  // 4. Seed Demo Expeditions (Rides)
  const demoRides = [
    {
      organisation: createdOrgs[0]._id,
      title: 'Umling La & Hanle Stargazer Circuit',
      slug: 'umling-la-hanle-stargazer-circuit',
      tagline: 'Conquer the highest motorable pass on Earth at 5,798m with full 4x4 oxygen backup.',
      region: 'Ladakh',
      startLocation: 'Leh',
      endLocation: 'Leh',
      maxAltitudeMeters: 5798,
      distanceKm: 1320,
      durationDays: 9,
      difficulty: 'extreme',
      startDate: new Date('2027-06-14'),
      endDate: new Date('2027-06-22'),
      priceInr: 48500,
      priceOwnBikeInr: 34500,
      maxRiders: 12,
      spotsRemaining: 5,
      coverImageUrl: '/images/expedition-ladakh.png',
      highlights: ['Khardung La (5,359m)', 'Pangong Tso Shoreline', 'Hanle Dark Sky Reserve', 'Umling La Summit (5,798m)'],
      itinerary: [
        {
          day: 1,
          title: 'Leh Arrival & Acclimatisation Check',
          route: 'Leh Local',
          altitudeMeters: 3500,
          distanceKm: 25,
          description: 'Bike handover, oxygen saturation baseline, and mandatory evening briefing.',
        },
        {
          day: 2,
          title: 'Over Khardung La to Nubra Valley',
          route: 'Leh → Khardung La → Diskit',
          altitudeMeters: 5359,
          distanceKm: 125,
          description: 'Ascend the iconic pass before descending to Shyok river dunes in Hunder.',
        },
        {
          day: 3,
          title: 'Shyok Gorge to Pangong Tso',
          route: 'Diskit → Agham → Shyok → Spangmik',
          altitudeMeters: 4225,
          distanceKm: 165,
          description: 'River crossings and turquoise lake vistas at golden hour.',
        },
        {
          day: 4,
          title: 'Changthang Plateau to Hanle',
          route: 'Pangong → Chushul → Tsaga La → Hanle',
          altitudeMeters: 4500,
          distanceKm: 185,
          description: 'Remote borderland tarmac and gravel trails into India’s Dark Sky Sanctuary.',
        },
        {
          day: 5,
          title: 'Umling La Summit Push',
          route: 'Hanle → Photi La → Umling La → Hanle',
          altitudeMeters: 5798,
          distanceKm: 150,
          description: 'Early dawn push across Chisumle bridge to the 19,024 ft summit.',
        },
      ],
      inclusions: ['Himalayan 450 rental & fuel', '4x4 sweep & mechanic', 'Medical oxygen & oximetry', 'Boutique stays & MAP meals'],
      exclusions: ['Airfare to Leh', 'Personal riding gear', 'Damages beyond insurance excess'],
      isFeatured: true,
      isDemo: true,
    },
    {
      organisation: createdOrgs[0]._id,
      title: 'Manali–Leh Trans-Himalayan Classic',
      slug: 'manali-leh-trans-himalayan-classic',
      tagline: 'Five iconic passes from pine valleys of Kullu to the high plateau of Leh.',
      region: 'Ladakh',
      startLocation: 'Manali',
      endLocation: 'Leh',
      maxAltitudeMeters: 5328,
      distanceKm: 1080,
      durationDays: 8,
      difficulty: 'challenging',
      startDate: new Date('2027-07-03'),
      endDate: new Date('2027-07-10'),
      priceInr: 41000,
      priceOwnBikeInr: 28500,
      maxRiders: 14,
      spotsRemaining: 7,
      coverImageUrl: '/images/hero-himalaya.png',
      highlights: ['Atal Tunnel & Jispa', 'Baralacha La (4,850m)', 'Gata Loops & Tanglang La', 'Tso Moriri Detour'],
      itinerary: [
        {
          day: 1,
          title: 'Manali Briefing & Shakedown Ride',
          route: 'Manali → Solang → Manali',
          altitudeMeters: 2050,
          distanceKm: 40,
          description: 'Gear check, luggage loading into backup truck, and convoy formation drills.',
        },
        {
          day: 2,
          title: 'Crossing into Lahaul Valley',
          route: 'Manali → Atal Tunnel → Keylong → Jispa',
          altitudeMeters: 3200,
          distanceKm: 95,
          description: 'Dramatic landscape shift from alpine forests to Chandra-Bhaga river canyons.',
        },
        {
          day: 3,
          title: 'Baralacha La & Sarchu Plains',
          route: 'Jispa → Baralacha La → Sarchu',
          altitudeMeters: 4850,
          distanceKm: 85,
          description: 'High pass switchbacks past Suraj Tal emerald glacial lake.',
        },
      ],
      inclusions: ['Motorcycle rental & fuel', 'Support truck & mechanic', 'All stays & breakfast/dinner'],
      exclusions: ['Flights', 'Lunch & trail snacks'],
      isFeatured: true,
      isDemo: true,
    },
    {
      organisation: createdOrgs[1]._id,
      title: 'Spiti Full-Loop Cold Desert Run',
      slug: 'spiti-full-loop-cold-desert-run',
      tagline: 'Carved cliffside roads of Kinnaur, Tabo monastery, Kaza, and Kunzum La.',
      region: 'Spiti Valley',
      startLocation: 'Shimla',
      endLocation: 'Manali',
      maxAltitudeMeters: 4590,
      distanceKm: 1180,
      durationDays: 9,
      difficulty: 'challenging',
      startDate: new Date('2027-06-20'),
      endDate: new Date('2027-06-28'),
      priceInr: 39500,
      priceOwnBikeInr: 26500,
      maxRiders: 10,
      spotsRemaining: 4,
      coverImageUrl: '/images/expedition-spiti.png',
      highlights: ['Hindustan-Tibet Cliff Road', 'Chitkul Last Village', 'Key Monastery & Langza', 'Kunzum La & Chandratal'],
      itinerary: [
        {
          day: 1,
          title: 'Shimla to Narkanda Pine Ridges',
          route: 'Shimla → Kufri → Narkanda',
          altitudeMeters: 2708,
          distanceKm: 65,
          description: 'Warm-up twisties through apple orchards and cedar forests.',
        },
        {
          day: 2,
          title: 'Kinnaur Cliffside Highway to Chitkul',
          route: 'Narkanda → Rampur → Sangla → Chitkul',
          altitudeMeters: 3450,
          distanceKm: 185,
          description: 'Iconic rock-cut overhangs along the roaring Sutlej & Baspa rivers.',
        },
        {
          day: 3,
          title: 'Nako Lake & Tabo Ancient Gompa',
          route: 'Chitkul → Khab Confluence → Nako → Tabo',
          altitudeMeters: 3662,
          distanceKm: 195,
          description: 'Enter the stark rain-shadow mountains of Spiti.',
        },
      ],
      inclusions: ['Prepped motorcycle', 'Heritage homestays', 'Oxygen & backup van', 'Lead & sweep marshals'],
      exclusions: ['Personal travel insurance', 'Alcohol & personal expenses'],
      isFeatured: true,
      isDemo: true,
    },
    {
      organisation: createdOrgs[2]._id,
      title: 'Old Silk Route & North Sikkim Odyssey',
      slug: 'old-silk-route-north-sikkim-odyssey',
      tagline: '96 hairpins of Zuluk, frozen Gurudongmar approaches, and Kanchenjunga sunrises.',
      region: 'Sikkim',
      startLocation: 'Siliguri',
      endLocation: 'Siliguri',
      maxAltitudeMeters: 5180,
      distanceKm: 890,
      durationDays: 8,
      difficulty: 'moderate',
      startDate: new Date('2027-04-18'),
      endDate: new Date('2027-04-25'),
      priceInr: 37500,
      priceOwnBikeInr: 25500,
      maxRiders: 12,
      spotsRemaining: 6,
      coverImageUrl: '/images/community-camp.png',
      highlights: ['Zuluk 32-Hairpin Loops', 'Nathang Valley', 'Lachen & Lachung', 'Yumthang Valley Rhododendrons'],
      itinerary: [
        {
          day: 1,
          title: 'Teesta Gorge Climb to Sillery Gaon',
          route: 'Siliguri → Kalimpong → Sillery Gaon',
          altitudeMeters: 1830,
          distanceKm: 95,
          description: 'Escape the plains into misty pine ridges overlooking Kanchenjunga.',
        },
        {
          day: 2,
          title: 'The Historic Zuluk Switchbacks',
          route: 'Sillery Gaon → Rongli → Zuluk → Nathang',
          altitudeMeters: 4100,
          distanceKm: 80,
          description: 'Permit check at Rongli followed by the legendary 32-tier hairpin climb.',
        },
      ],
      inclusions: ['Restricted Area Permits', 'Motorcycle & fuel', 'Timber lodges & meals', 'Support SUV'],
      exclusions: ['Rail/Flight to Bagdogra', 'Personal rain gear'],
      isFeatured: true,
      isDemo: true,
    },
    {
      organisation: createdOrgs[3]._id,
      title: 'Zanskar Shinku La Wilderness Traverse',
      slug: 'zanskar-shinku-la-wilderness-traverse',
      tagline: 'Raw river crossings and remote monasteries via the new Padum–Darcha axis.',
      region: 'Zanskar',
      startLocation: 'Manali',
      endLocation: 'Leh',
      maxAltitudeMeters: 5091,
      distanceKm: 940,
      durationDays: 7,
      difficulty: 'extreme',
      startDate: new Date('2027-08-08'),
      endDate: new Date('2027-08-14'),
      priceInr: 44000,
      priceOwnBikeInr: 31000,
      maxRiders: 8,
      spotsRemaining: 5,
      coverImageUrl: '/images/expedition-ladakh.png',
      highlights: ['Shinku La (5,091m)', 'Gonbo Rangjon Sacred Peak', 'Padum & Phugtal Trail', 'Singe La Pass'],
      itinerary: [
        {
          day: 1,
          title: 'Manali to Darcha Basecamp',
          route: 'Manali → Atal Tunnel → Darcha',
          altitudeMeters: 3360,
          distanceKm: 115,
          description: 'Basecamp staging near the Bhaga river before entering Zanskar.',
        },
        {
          day: 2,
          title: 'Shinku La to Gonbo Rangjon',
          route: 'Darcha → Shinku La → Purne',
          altitudeMeters: 5091,
          distanceKm: 95,
          description: 'Glacial stream crossings under the towering monolith of Gonbo Rangjon.',
        },
      ],
      inclusions: ['Trail-prepped motorcycle', 'Camp accommodation', 'Backup van & oxygen'],
      exclusions: ['Flights', 'Personal riding armor'],
      isFeatured: false,
      isDemo: true,
    },
  ];

  const createdRides = [];
  for (const r of demoRides) {
    const rideRow = await tx.queryOne(
      `INSERT INTO rides (
         organisation_id, title, slug, tagline, description, region,
         start_location, end_location, max_altitude_meters, distance_km, duration_days,
         difficulty, start_date, end_date, price_inr, price_own_bike_inr,
         max_riders, spots_remaining, cover_image_url, booking_url, bike_rental_available,
         facilities_summary, highlights, itinerary, inclusions, exclusions,
         status, is_featured, is_demo
       )
       VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16,
         $17, $18, $19, $20, $21,
         $22, $23::text[], $24::jsonb, $25::text[], $26::text[],
         $27, $28, TRUE
       )
       RETURNING *`,
      [
        r.organisation,
        r.title,
        r.slug,
        r.tagline || '',
        r.description || '',
        r.region,
        r.startLocation,
        r.endLocation,
        r.maxAltitudeMeters ?? 0,
        r.distanceKm,
        r.durationDays,
        r.difficulty || 'challenging',
        r.startDate,
        r.endDate,
        r.priceInr,
        r.priceOwnBikeInr ?? null,
        r.maxRiders ?? 12,
        r.spotsRemaining ?? r.maxRiders ?? 12,
        r.coverImageUrl || '',
        r.bookingUrl || '',
        r.bikeRentalAvailable ?? true,
        r.facilitiesSummary || '',
        r.highlights || [],
        JSON.stringify(r.itinerary || []),
        r.inclusions || [],
        r.exclusions || [],
        r.status || 'published',
        Boolean(r.isFeatured),
      ]
    );
    createdRides.push({ ...rideRow, _id: rideRow.id });
  }

  // Seed Phase 4 Demo Routes & Checkpoints on featured expeditions (intentionally leaving ride[3] empty to show no-route state)
  const umlingCoords = [
    [77.5771, 34.1526], // Leh
    [77.6047, 34.2787], // Khardung La
    [77.5499, 34.5446], // Diskit Nubra
    [78.0815, 34.1782], // Shyok corridor
    [78.6601, 33.7595], // Pangong Spangmik
    [78.9693, 32.7791], // Hanle Dark Sky Reserve
    [79.2869, 32.6961], // Umling La Summit
  ];
  const umlingRoute = {
    startPoint: { label: 'Leh Main Basecamp (Demo)', coordinates: [77.5771, 34.1526] },
    endPoint: { label: 'Umling La & Hanle Return (Demo)', coordinates: [79.2869, 32.6961] },
    geometry: { type: 'LineString', coordinates: umlingCoords },
    dailySegments: [
      {
        day: 1,
        title: 'Leh Acclimatisation Loop',
        startLabel: 'Leh',
        endLabel: 'Hall of Fame',
        distanceKm: 25,
        coordinates: [[77.5771, 34.1526], [77.5401, 34.1422]],
      },
      {
        day: 2,
        title: 'Leh to Nubra via Khardung La',
        startLabel: 'Leh',
        endLabel: 'Diskit',
        distanceKm: computeLineStringDistanceKm([[77.5771, 34.1526], [77.6047, 34.2787], [77.5499, 34.5446]]),
        coordinates: [[77.5771, 34.1526], [77.6047, 34.2787], [77.5499, 34.5446]],
      },
    ],
    routeDescription: 'Demo high-altitude Changthang & Nubra route traversing Khardung La, Pangong Tso, Hanle, and Umling La.',
    calculatedDistanceKm: computeLineStringDistanceKm(umlingCoords),
    hasRouteData: true,
  };
  await tx.query('UPDATE rides SET route = $1::jsonb WHERE id = $2', [JSON.stringify(umlingRoute), createdRides[0]._id]);

  const manaliLehCoords = [
    [77.1892, 32.2432], // Manali
    [77.1456, 32.3982], // Atal Tunnel North Portal
    [77.1818, 32.6331], // Jispa
    [77.4126, 32.7574], // Baralacha La
    [77.5844, 32.8054], // Sarchu
    [77.7712, 33.5996], // Tanglang La
    [77.5771, 34.1526], // Leh
  ];
  const manaliLehRoute = {
    startPoint: { label: 'Manali Mall Road Base (Demo)', coordinates: [77.1892, 32.2432] },
    endPoint: { label: 'Leh Polo Ground Finish (Demo)', coordinates: [77.5771, 34.1526] },
    geometry: { type: 'LineString', coordinates: manaliLehCoords },
    dailySegments: [],
    routeDescription: 'Demo Trans-Himalayan axis along the Manali–Leh highway across five mountain passes.',
    calculatedDistanceKm: computeLineStringDistanceKm(manaliLehCoords),
    hasRouteData: true,
  };
  await tx.query('UPDATE rides SET route = $1::jsonb WHERE id = $2', [JSON.stringify(manaliLehRoute), createdRides[1]._id]);

  const spitiCoords = [
    [77.1734, 31.1048], // Shimla
    [77.4601, 31.2571], // Narkanda
    [78.4357, 31.3512], // Chitkul
    [78.6137, 31.8794], // Nako
    [78.0706, 32.2276], // Kaza
    [77.6377, 32.3984], // Kunzum La
    [77.1892, 32.2432], // Manali
  ];
  const spitiRoute = {
    startPoint: { label: 'Shimla Ridge Start (Demo)', coordinates: [77.1734, 31.1048] },
    endPoint: { label: 'Manali Valley Finish (Demo)', coordinates: [77.1892, 32.2432] },
    geometry: { type: 'LineString', coordinates: spitiCoords },
    dailySegments: [],
    routeDescription: 'Demo Hindustan-Tibet cliff road to Spiti & Kunzum La loop.',
    calculatedDistanceKm: computeLineStringDistanceKm(spitiCoords),
    hasRouteData: true,
  };
  await tx.query('UPDATE rides SET route = $1::jsonb WHERE id = $2', [JSON.stringify(spitiRoute), createdRides[2]._id]);

  const demoCheckpoints = [
    {
      ride: createdRides[0]._id,
      organisation: createdOrgs[0]._id,
      name: 'Leh Staging Courtyard',
      description: 'Acclimatisation briefing & morning convoy flag-off.',
      type: 'start',
      coordinates: [77.5771, 34.1526],
      altitudeMeters: 3500,
      sequenceNumber: 1,
      radiusMeters: 300,
    },
    {
      ride: createdRides[0]._id,
      organisation: createdOrgs[0]._id,
      name: 'Khardung La Top Pass',
      description: 'Mandatory hydration & oxygen check at pass signage.',
      type: 'checkpoint',
      coordinates: [77.6047, 34.2787],
      altitudeMeters: 5359,
      sequenceNumber: 2,
      radiusMeters: 350,
    },
    {
      ride: createdRides[0]._id,
      organisation: createdOrgs[0]._id,
      name: 'Diskit Fuel Station',
      description: 'Last full-tank fuel stop before remote Nubra-Shyok stretch.',
      type: 'fuel_stop',
      coordinates: [77.5499, 34.5446],
      altitudeMeters: 3144,
      sequenceNumber: 3,
      radiusMeters: 300,
    },
    {
      ride: createdRides[0]._id,
      organisation: createdOrgs[0]._id,
      name: 'Pangong Spangmik Rest Camp',
      description: 'Hot tea, lunch halt, and mechanic inspection.',
      type: 'rest_stop',
      coordinates: [78.6601, 33.7595],
      altitudeMeters: 4225,
      sequenceNumber: 4,
      radiusMeters: 350,
    },
    {
      ride: createdRides[0]._id,
      organisation: createdOrgs[0]._id,
      name: 'Hanle Dark Sky Observatory',
      description: 'Evening stargazing and permit verification checkpoint.',
      type: 'important',
      coordinates: [78.9693, 32.7791],
      altitudeMeters: 4500,
      sequenceNumber: 5,
      radiusMeters: 400,
    },
    {
      ride: createdRides[0]._id,
      organisation: createdOrgs[0]._id,
      name: 'Umling La Summit',
      description: 'Official 5,798m expedition turnaround & finish marker.',
      type: 'destination',
      coordinates: [79.2869, 32.6961],
      altitudeMeters: 5798,
      sequenceNumber: 6,
      radiusMeters: 400,
    },
    {
      ride: createdRides[1]._id,
      organisation: createdOrgs[0]._id,
      name: 'Manali Convoy Assembly',
      description: 'Start line and luggage loading.',
      type: 'start',
      coordinates: [77.1892, 32.2432],
      altitudeMeters: 2050,
      sequenceNumber: 1,
      radiusMeters: 300,
    },
    {
      ride: createdRides[1]._id,
      organisation: createdOrgs[0]._id,
      name: 'Jispa Fuel & Tea Halt',
      description: 'Refuel before Tandi/Jispa bridge and Baralacha ascent.',
      type: 'fuel_stop',
      coordinates: [77.1818, 32.6331],
      altitudeMeters: 3200,
      sequenceNumber: 2,
      radiusMeters: 300,
    },
    {
      ride: createdRides[1]._id,
      organisation: createdOrgs[0]._id,
      name: 'Leh Finish Arch',
      description: 'Expedition finish arrival checkpoint.',
      type: 'destination',
      coordinates: [77.5771, 34.1526],
      altitudeMeters: 3500,
      sequenceNumber: 3,
      radiusMeters: 350,
    },
    {
      ride: createdRides[2]._id,
      organisation: createdOrgs[1]._id,
      name: 'Shimla Start Line',
      description: 'Flag-off point.',
      type: 'start',
      coordinates: [77.1734, 31.1048],
      altitudeMeters: 2200,
      sequenceNumber: 1,
      radiusMeters: 300,
    },
    {
      ride: createdRides[2]._id,
      organisation: createdOrgs[1]._id,
      name: 'Kaza Main Bazaar & Fuel',
      description: 'Refuel and mechanic check in Spiti HQ.',
      type: 'fuel_stop',
      coordinates: [78.0706, 32.2276],
      altitudeMeters: 3650,
      sequenceNumber: 2,
      radiusMeters: 300,
    },
    {
      ride: createdRides[2]._id,
      organisation: createdOrgs[1]._id,
      name: 'Kunzum La Top',
      description: 'High mountain pass arrival gate.',
      type: 'checkpoint',
      coordinates: [77.6377, 32.3984],
      altitudeMeters: 4590,
      sequenceNumber: 3,
      radiusMeters: 350,
    },
  ];

  for (const cp of demoCheckpoints) {
    await tx.query(
      `INSERT INTO checkpoints
         (ride_id, organisation_id, name, description, type, lng, lat, altitude_meters, sequence_number, radius_meters)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        cp.ride,
        cp.organisation,
        cp.name,
        cp.description || '',
        cp.type,
        cp.coordinates[0],
        cp.coordinates[1],
        cp.altitudeMeters ?? null,
        cp.sequenceNumber,
        cp.radiusMeters ?? 250,
      ]
    );
  }

  // Seed 2 clearly labelled demo public KAAFILA Groups
  const demoGroupSpecs = [
    {
      name: 'Ladakh High-Pass Riders (Demo Group)',
      slug: 'ladakh-high-pass-riders-demo',
      coverImageUrl: '/images/expedition-ladakh.png',
      organisation: createdOrgs[0]._id,
      ride: createdRides[0]._id,
      destination: 'Ladakh',
      startDate: new Date('2027-07-12'),
      maxMembers: 30,
      description:
        'Demo community group for riders preparing for Khardung La, Hanle, and Umling La expeditions.',
      privacy: 'public',
      createdBy: createdOrgs[0].owner,
    },
    {
      name: 'Spiti Cold Desert Convoy (Demo Group)',
      slug: 'spiti-cold-desert-convoy-demo',
      coverImageUrl: '/images/expedition-spiti.png',
      organisation: createdOrgs[1]._id,
      ride: createdRides[2]?._id || null,
      destination: 'Spiti Valley',
      startDate: new Date('2027-06-20'),
      maxMembers: 20,
      description:
        'Demo private expedition group for Spiti & Kunzum La riders. Request access to preview approval flow.',
      privacy: 'private',
      createdBy: createdOrgs[1].owner,
    },
  ];

  const demoGroups = [];
  for (const g of demoGroupSpecs) {
    const gRow = await tx.queryOne(
      `INSERT INTO kafila_groups
         (name, slug, cover_image_url, organisation_id, ride_id, destination, start_date,
          max_members, description, privacy, created_by_id, is_demo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
       RETURNING *`,
      [
        g.name,
        g.slug,
        g.coverImageUrl,
        g.organisation,
        g.ride,
        g.destination,
        g.startDate,
        g.maxMembers,
        g.description,
        g.privacy,
        g.createdBy,
      ]
    );
    demoGroups.push({ ...gRow, _id: gRow.id });
  }

  const groupMemberSpecs = [
    { group: demoGroups[0]._id, user: createdOrgs[0].owner, role: 'owner', status: 'active' },
    { group: demoGroups[0]._id, user: riderUsers[0]._id, role: 'member', status: 'active' },
    { group: demoGroups[1]._id, user: createdOrgs[1].owner, role: 'owner', status: 'active' },
  ];
  for (const gm of groupMemberSpecs) {
    await tx.query(
      `INSERT INTO group_members (group_id, user_id, role, status)
       VALUES ($1, $2, $3, $4)`,
      [gm.group, gm.user, gm.role, gm.status]
    );
  }

  await tx.query(
    `INSERT INTO messages (sender_id, group_id, message_type, title, content, is_pinned, read_by)
     VALUES ($1, $2, 'announcement', $3, $4, TRUE, ARRAY[$1::uuid])`,
    [
      createdOrgs[0].owner,
      demoGroups[0]._id,
      'Demo Safety Briefing Schedule',
      'Acclimatisation check begins at 07:30 AM Leh hotel courtyard. Carry spare thermal gloves and hydration packs.',
    ]
  );

    console.log('[SEED] Seeded clearly labelled KAAFILA demo data (4 organisations, 5 expeditions, 5 demo riders, 2 demo groups).');
    return { seeded: true };
  });
}

