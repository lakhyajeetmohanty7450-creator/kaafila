import bcrypt from 'bcryptjs';
import { query, queryOne, transaction } from '../config/pg.js';
import { signToken } from '../middleware/auth.js';
import { getHydratedRiderProfile } from '../repositories/common.js';
import { mapOrganisation, mapUser } from '../repositories/mappers.js';
import { isValidHttpUrl } from '../utils/validators.js';
import { toSlug, uniqueSlug } from '../utils/slugify.js';

function parseLocationInput(locationInput, cityInput, stateInput, regionInput) {
  if (cityInput && stateInput && regionInput) {
    return {
      city: String(cityInput).trim(),
      state: String(stateInput).trim(),
      region: String(regionInput).trim(),
      country: 'India',
    };
  }

  const raw = String(locationInput || '').trim();
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  const city = cityInput?.trim() || parts[0] || raw || 'Himalayas';
  const state = stateInput?.trim() || parts[1] || city;
  const region = regionInput?.trim() || parts[2] || state || city;
  return { city, state, region, country: 'India' };
}

export async function registerRider(req, res, next) {
  try {
    const {
      fullName,
      handle,
      email,
      password,
      confirmPassword,
      phoneNumber = '',
      city = '',
      homeCity = '',
      primaryMotorcycle = '',
      ridingExperience = 'beginner',
      bio = '',
    } = req.body;

    const resolvedCity = String(city || homeCity || '').trim();

    if (
      typeof fullName !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !fullName.trim() ||
      !email.trim() ||
      !password ||
      !resolvedCity
    ) {
      return res.status(400).json({
        success: false,
        message: 'Full name, email, password, and city are required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password and confirm password do not match.',
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existingUser = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    let normalizedHandle = handle
      ? String(handle).toLowerCase().trim()
      : `${(toSlug(fullName).replace(/-/g, '_') || 'rider').slice(0, 20).replace(/_+$/, '') || 'rider'}_${Math.random().toString(36).slice(2, 6)}`;

    const handleExists = await queryOne('SELECT id FROM rider_profiles WHERE handle = $1', [normalizedHandle]);
    if (handleExists) {
      normalizedHandle = `${normalizedHandle.slice(0, 24)}_${Math.random().toString(36).slice(2, 6)}`;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const validExperience = ['beginner', 'intermediate', 'advanced', 'expedition_veteran'].includes(ridingExperience)
      ? ridingExperience
      : 'beginner';

    const { userDto, profileDto } = await transaction(async (tx) => {
      const userRow = await tx.queryOne(
        `INSERT INTO users (full_name, email, password_hash, role, phone_number, city, last_login_at)
         VALUES ($1, $2, $3, 'rider', $4, $5, NOW())
         RETURNING *`,
        [String(fullName).trim(), normalizedEmail, passwordHash, String(phoneNumber || '').trim(), resolvedCity]
      );

      await tx.queryOne(
        `INSERT INTO rider_profiles
           (user_id, handle, bio, home_city, primary_motorcycle, riding_experience, is_demo)
         VALUES ($1, $2, $3, $4, $5, $6, FALSE)
         RETURNING *`,
        [
          userRow.id,
          normalizedHandle,
          String(bio || '').trim(),
          resolvedCity,
          String(primaryMotorcycle || '').trim(),
          validExperience,
        ]
      );

      const uDto = mapUser(userRow, { includeEmail: true, includePhone: true });
      const pDto = await getHydratedRiderProfile(userRow.id, { includeRankHistory: true }, tx);
      return { userDto: uDto, profileDto: pDto };
    });

    const token = signToken(userDto);

    return res.status(201).json({
      success: true,
      message: 'Rider account created successfully.',
      data: {
        token,
        user: userDto,
        riderProfile: profileDto,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function registerOrganisation(req, res, next) {
  try {
    const {
      organisationName,
      name,
      contactPersonName,
      fullName,
      email,
      officialEmail,
      password,
      confirmPassword,
      contactNumber = '',
      phoneNumber = '',
      location = '',
      city = '',
      state = '',
      region = '',
      shortDescription = '',
      description = '',
      officialWebsite = '',
      bookingUrl = '',
      operatingRegions = [],
    } = req.body;

    const resolvedOrgName = String(organisationName || name || '').trim();
    const resolvedContactName = String(contactPersonName || fullName || resolvedOrgName || '').trim();
    const resolvedPhone = String(contactNumber || phoneNumber || '').trim();
    const rawEmail = officialEmail || email;
    const resolvedDescription = String(shortDescription || description || '').trim();
    const parsedLoc = parseLocationInput(location, city, state, region);

    if (
      !resolvedOrgName ||
      !resolvedContactName ||
      typeof rawEmail !== 'string' ||
      typeof password !== 'string' ||
      !rawEmail.trim() ||
      !password ||
      (!location && !city)
    ) {
      return res.status(400).json({
        success: false,
        message: 'Organisation name, email, password, and base location are required.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long.',
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: 'Password and confirm password do not match.',
      });
    }

    if (officialWebsite && !isValidHttpUrl(officialWebsite)) {
      return res.status(400).json({
        success: false,
        message: 'Official website must start with http:// or https://',
      });
    }

    if (bookingUrl && !isValidHttpUrl(bookingUrl)) {
      return res.status(400).json({
        success: false,
        message: 'Booking URL must start with http:// or https://',
      });
    }

    const normalizedEmail = String(rawEmail).toLowerCase().trim();
    const existingUser = await queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [normalizedEmail]);
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    let slug = toSlug(resolvedOrgName) || `org-${Date.now()}`;
    const existingSlug = await queryOne('SELECT id FROM organisations WHERE LOWER(slug) = LOWER($1)', [slug]);
    if (existingSlug) {
      slug = uniqueSlug(resolvedOrgName);
    }

    const regionsList =
      Array.isArray(operatingRegions) && operatingRegions.length > 0
        ? operatingRegions.map((r) => String(r).trim()).filter(Boolean)
        : [parsedLoc.region].filter(Boolean);

    const passwordHash = await bcrypt.hash(password, 12);
    const defaultShortDesc =
      resolvedDescription ||
      `Motorcycle expedition operator based in ${parsedLoc.city}, ${parsedLoc.state}.`;

    const { userDto, orgDto } = await transaction(async (tx) => {
      const userRow = await tx.queryOne(
        `INSERT INTO users (full_name, email, password_hash, role, phone_number, city, last_login_at)
         VALUES ($1, $2, $3, 'organisation', $4, $5, NOW())
         RETURNING *`,
        [resolvedContactName, normalizedEmail, passwordHash, resolvedPhone, parsedLoc.city]
      );

      const orgRow = await tx.queryOne(
        `INSERT INTO organisations
           (owner_id, name, slug, location, operating_regions, short_description,
            official_website, booking_url, contact_number, verification_status, is_verified, is_demo)
         VALUES ($1, $2, $3, $4::jsonb, $5::text[], $6, $7, $8, $9, 'pending', FALSE, FALSE)
         RETURNING *`,
        [
          userRow.id,
          resolvedOrgName,
          slug,
          JSON.stringify(parsedLoc),
          regionsList,
          defaultShortDesc,
          String(officialWebsite || '').trim(),
          String(bookingUrl || officialWebsite || '').trim(),
          resolvedPhone,
        ]
      );

      await tx.query(
        `INSERT INTO organisation_members (organisation_id, user_id, member_role, status)
         VALUES ($1, $2, 'owner', 'active')`,
        [orgRow.id, userRow.id]
      );

      return {
        userDto: mapUser(userRow, { includeEmail: true, includePhone: true }),
        orgDto: mapOrganisation(orgRow),
      };
    });

    const token = signToken(userDto);

    return res.status(201).json({
      success: true,
      message: 'Organisation account registered and queued for verification.',
      data: {
        token,
        user: userDto,
        organisation: orgDto,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password, expectedRole } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const userRow = await queryOne('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [email.trim()]);
    if (!userRow) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!userRow.is_active) {
      return res.status(403).json({ success: false, message: 'This account is currently deactivated.' });
    }

    const isMatch = await bcrypt.compare(password, userRow.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (expectedRole && userRow.role !== expectedRole) {
      return res.status(403).json({
        success: false,
        message: `Please sign in via the ${userRow.role} portal (account role mismatch).`,
      });
    }

    const updatedUserRow = await queryOne(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1 RETURNING *',
      [userRow.id]
    );
    const userDto = mapUser(updatedUserRow || userRow, { includeEmail: true, includePhone: true });
    const token = signToken(userDto);

    let riderProfile = null;
    let organisation = null;

    if (userDto.role === 'rider') {
      riderProfile = await getHydratedRiderProfile(userDto.id, { includeRankHistory: true });
    } else if (userDto.role === 'organisation') {
      const orgRow = await queryOne('SELECT * FROM organisations WHERE owner_id = $1 LIMIT 1', [userDto.id]);
      organisation = orgRow ? mapOrganisation(orgRow) : null;
    }

    return res.json({
      success: true,
      message: 'Welcome back to KAAFILA.',
      data: {
        token,
        user: userDto,
        riderProfile,
        organisation,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    let riderProfile = null;
    let organisation = null;

    if (req.user.role === 'rider') {
      riderProfile = await getHydratedRiderProfile(req.user.id, { includeRankHistory: true });
    } else if (req.user.role === 'organisation') {
      const orgRow = await queryOne('SELECT * FROM organisations WHERE owner_id = $1 LIMIT 1', [req.user.id]);
      organisation = orgRow ? mapOrganisation(orgRow) : null;
    }

    return res.json({
      success: true,
      data: {
        user: req.user,
        riderProfile,
        organisation,
      },
    });
  } catch (err) {
    next(err);
  }
}
