/**
 * Row-to-DTO mappers translating snake_case PostgreSQL rows into
 * exact KAAFILA camelCase REST/Socket DTOs (preserving `_id` and `id`).
 */

export function mapUser(row, options = {}) {
  if (!row) return null;
  const { includeEmail = true, includePhone = true, includePasswordHash = false } = options;
  const dto = {
    _id: row.id,
    id: row.id,
    fullName: row.full_name,
    role: row.role,
    city: row.city || '',
    avatarUrl: row.avatar_url || '',
    isActive: row.is_active !== false,
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includeEmail) dto.email = row.email;
  if (includePhone) dto.phoneNumber = row.phone_number || '';
  if (includePasswordHash && row.password_hash) dto.passwordHash = row.password_hash;
  return dto;
}

export function mapRiderProfile(row, options = {}) {
  if (!row) return null;
  const { user = undefined, badges = [], rankHistory = undefined, includeEmergencyContact = true } = options;
  const dto = {
    _id: row.id,
    id: row.id,
    user: user !== undefined ? user : row.user_id,
    userId: row.user_id,
    handle: row.handle,
    bio: row.bio || '',
    homeCity: row.home_city || '',
    primaryMotorcycle: row.primary_motorcycle || '',
    ridingExperience: row.riding_experience || 'beginner',
    verifiedKilometres: Number(row.verified_kilometres || 0),
    completedExpeditions: Number(row.completed_expeditions || 0),
    rank: row.rank || 'Beginner',
    badges: badges.map((b) => ({
      code: b.achievement_code || b.code,
      title: b.title,
      awardedAt: b.awarded_at || b.awardedAt,
    })),
    isProfilePublic: row.is_profile_public !== false,
    canCreateGroups: row.can_create_groups !== false,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (includeEmergencyContact) {
    dto.emergencyContact = row.emergency_contact || {
      name: '',
      relationship: '',
      phone: '',
      bloodGroup: '',
      shareWithOrganisers: false,
    };
  }
  if (rankHistory !== undefined) {
    dto.rankHistory = rankHistory.map((h) => ({
      fromRank: h.from_rank,
      toRank: h.to_rank,
      verifiedKilometres: Number(h.verified_kilometres || 0),
      completedExpeditions: Number(h.completed_expeditions || 0),
      achievementCount: Number(h.achievement_count || 0),
      reason: h.reason,
      changedAt: h.changed_at,
    }));
  }
  return dto;
}

export function mapOrganisation(row, options = {}) {
  if (!row) return null;
  const { owner = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    owner: owner !== undefined ? owner : row.owner_id,
    name: row.name,
    slug: row.slug,
    location: row.location || { city: '', state: '', country: 'India', address: '' },
    operatingRegions: Array.isArray(row.operating_regions) ? row.operating_regions : [],
    shortDescription: row.short_description || '',
    about: row.about || '',
    logoUrl: row.logo_url || '',
    coverImageUrl: row.cover_image_url || '',
    officialWebsite: row.official_website || '',
    bookingUrl: row.booking_url || '',
    contactNumber: row.contact_number || '',
    foundedYear: row.founded_year ?? undefined,
    verificationStatus: row.verification_status || 'pending',
    isVerified: Boolean(row.is_verified),
    facilities: row.facilities || {
      mechanicSupport: true,
      backupVehicle: true,
      medicalKit: true,
      oxygenSupport: false,
      accommodation: true,
      gearRental: false,
      customSummary: '',
    },
    ratingAverage: Number(row.review_count || 0) > 0 ? Number(row.rating_average || 0) : null,
    reviewCount: Number(row.review_count || 0),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOrganisationMember(row, options = {}) {
  if (!row) return null;
  const { user = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    organisation: row.organisation_id,
    user: user !== undefined ? user : row.user_id,
    memberRole: row.member_role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRide(row, options = {}) {
  if (!row) return null;
  const { organisation = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    organisation: organisation !== undefined ? organisation : row.organisation_id,
    title: row.title,
    slug: row.slug,
    tagline: row.tagline || '',
    description: row.description || '',
    region: row.region,
    startLocation: row.start_location,
    endLocation: row.end_location,
    maxAltitudeMeters: Number(row.max_altitude_meters || 0),
    distanceKm: Number(row.distance_km || 0),
    durationDays: Number(row.duration_days || 1),
    difficulty: row.difficulty || 'challenging',
    startDate: row.start_date,
    endDate: row.end_date,
    priceInr: Number(row.price_inr || 0),
    priceOwnBikeInr: row.price_own_bike_inr !== null && row.price_own_bike_inr !== undefined
      ? Number(row.price_own_bike_inr)
      : undefined,
    currency: row.currency || 'INR',
    maxRiders: Number(row.max_riders || 12),
    spotsRemaining: Number(row.spots_remaining ?? row.max_riders ?? 12),
    coverImageUrl: row.cover_image_url || '',
    bookingUrl: row.booking_url || '',
    bikeRentalAvailable: row.bike_rental_available !== false,
    facilitiesSummary: row.facilities_summary || '',
    highlights: Array.isArray(row.highlights) ? row.highlights : [],
    itinerary: Array.isArray(row.itinerary) ? row.itinerary : [],
    route: row.route || {
      startPoint: { label: row.start_location || '' },
      endPoint: { label: row.end_location || '' },
      geometry: { type: 'LineString', coordinates: [] },
      dailySegments: [],
      routeDescription: '',
      calculatedDistanceKm: 0,
      hasRouteData: false,
    },
    inclusions: Array.isArray(row.inclusions) ? row.inclusions : [],
    exclusions: Array.isArray(row.exclusions) ? row.exclusions : [],
    status: row.status || 'published',
    isFeatured: Boolean(row.is_featured),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapRideMember(row, options = {}) {
  if (!row) return null;
  const { ride = undefined, user = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    ride: ride !== undefined ? ride : row.ride_id,
    user: user !== undefined ? user : row.user_id,
    status: row.status,
    bikeChoice: row.bike_choice || 'rental',
    shareContactWithOrganisation: Boolean(row.share_contact_with_organisation),
    verifiedKmAwarded: Number(row.verified_km_awarded || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapReview(row, options = {}) {
  if (!row) return null;
  const { author = undefined, ride = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    organisation: row.organisation_id,
    author: author !== undefined ? author : row.author_id,
    ride: ride !== undefined ? ride : row.ride_id || null,
    rating: Number(row.rating),
    title: row.title,
    comment: row.comment,
    isVerifiedParticipant: Boolean(row.is_verified_participant),
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConnection(row, options = {}) {
  if (!row) return null;
  const { requester = undefined, recipient = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    requester: requester !== undefined ? requester : row.requester_id,
    recipient: recipient !== undefined ? recipient : row.recipient_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapConversation(row, options = {}) {
  if (!row) return null;
  const { lastMessage = undefined, participants = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    participants: participants || [row.participant_a_id, row.participant_b_id],
    participantKey: row.participant_key,
    lastMessage: lastMessage !== undefined ? lastMessage : row.last_message_id || null,
    lastMessageText: row.last_message_text || '',
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapMessage(row, options = {}) {
  if (!row) return null;
  const { sender = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    sender: sender !== undefined ? sender : row.sender_id,
    conversation: row.conversation_id || null,
    recipientUser: row.recipient_user_id || null,
    group: row.group_id || null,
    messageType: row.message_type || 'text',
    title: row.title || '',
    content: row.content,
    isPinned: Boolean(row.is_pinned),
    editedAt: row.edited_at || null,
    readBy: Array.isArray(row.read_by) ? row.read_by : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapGroup(row, options = {}) {
  if (!row) return null;
  const { organisation = undefined, ride = undefined, createdBy = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    name: row.name,
    slug: row.slug,
    coverImageUrl: row.cover_image_url || '',
    organisation: organisation !== undefined ? organisation : row.organisation_id || null,
    ride: ride !== undefined ? ride : row.ride_id || null,
    destination: row.destination || '',
    startDate: row.start_date || null,
    maxMembers: Number(row.max_members || 40),
    description: row.description || '',
    privacy: row.privacy || 'public',
    voiceRoomStatus: row.voice_room_status || 'coming_soon',
    createdBy: createdBy !== undefined ? createdBy : row.created_by_id,
    isDemo: Boolean(row.is_demo),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapGroupMember(row, options = {}) {
  if (!row) return null;
  const { user = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    group: row.group_id,
    user: user !== undefined ? user : row.user_id,
    role: row.role,
    status: row.status,
    invitedBy: row.invited_by_id || null,
    locationSharingOptIn: Boolean(row.location_sharing_opt_in),
    lastReadAt: row.last_read_at,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapNotification(row, options = {}) {
  if (!row) return null;
  const { actor = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    recipient: row.recipient_id,
    actor: actor !== undefined ? actor : row.actor_id || null,
    type: row.type,
    title: row.title,
    body: row.body || '',
    link: row.link || '',
    metadata: row.metadata || {},
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCheckpoint(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    ride: row.ride_id,
    organisation: row.organisation_id,
    name: row.name,
    description: row.description || '',
    type: row.type || 'checkpoint',
    coordinates: [Number(row.lng), Number(row.lat)],
    altitudeMeters: row.altitude_meters ?? undefined,
    sequenceNumber: Number(row.sequence_number),
    radiusMeters: Number(row.radius_meters || 250),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCheckpointArrival(row, options = {}) {
  if (!row) return null;
  const { checkpoint = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    user: row.user_id,
    ride: row.ride_id,
    checkpoint: checkpoint !== undefined ? checkpoint : row.checkpoint_id,
    trackingSession: row.tracking_session_id || null,
    verified: row.verified !== false,
    verificationMethod: row.verification_method || 'gps_proximity',
    distanceFromCheckpointMeters: Number(row.distance_from_checkpoint_meters || 0),
    reportedAccuracyMeters: Number(row.reported_accuracy_meters || 0),
    arrivedAt: row.arrived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTrackingSession(row, options = {}) {
  if (!row) return null;
  const { ride = undefined, group = undefined, user = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    user: user !== undefined ? user : row.user_id,
    ride: ride !== undefined ? ride : row.ride_id || null,
    group: group !== undefined ? group : row.group_id || null,
    title: row.title,
    status: row.status,
    isLocationSharingEnabled: Boolean(row.is_location_sharing_enabled),
    shareSimplifiedRoutePublic: Boolean(row.share_simplified_route_public),
    startedAt: row.started_at,
    pausedAt: row.paused_at || null,
    endedAt: row.ended_at || null,
    activeDurationSeconds: Number(row.active_duration_seconds || 0),
    points: Array.isArray(row.points) ? row.points : [],
    simplifiedPublicRoute: Array.isArray(row.simplified_public_route) ? row.simplified_public_route : [],
    estimatedDistanceKm: Number(row.estimated_distance_km || 0),
    submittedDistanceKm: Number(row.submitted_distance_km || 0),
    verifiedDistanceKm: Number(row.verified_distance_km || 0),
    pointsAwardedToProfile: Boolean(row.points_awarded_to_profile),
    verificationStatus: row.verification_status || 'recording',
    suspiciousFlags: Array.isArray(row.suspicious_flags) ? row.suspicious_flags : [],
    distanceAdjustments: Array.isArray(row.distance_adjustments) ? row.distance_adjustments : [],
    stats: row.stats || {
      totalPoints: 0,
      acceptedCount: 0,
      filteredPoorAccuracy: 0,
      filteredDuplicates: 0,
      filteredJumps: 0,
      maxObservedSpeedKmh: 0,
      averageAccuracyMeters: 0,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapGroupLocation(row, options = {}) {
  if (!row) return null;
  const { user = undefined } = options;
  return {
    _id: row.id,
    id: row.id,
    group: row.group_id,
    user: user !== undefined ? user : row.user_id,
    trackingSession: row.tracking_session_id || null,
    sharingEnabled: Boolean(row.sharing_enabled),
    lat: row.lat !== null && row.lat !== undefined ? Number(row.lat) : null,
    lng: row.lng !== null && row.lng !== undefined ? Number(row.lng) : null,
    accuracyMeters: row.accuracy_meters ?? null,
    heading: row.heading ?? null,
    speedKmh: row.speed_kmh ?? null,
    updatedAt: row.updated_at,
  };
}

export function mapAchievement(row) {
  if (!row) return null;
  return {
    _id: row.id,
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    tier: row.tier,
    icon: row.icon,
    criteriaKm: Number(row.criteria_km || 0),
    criteriaRides: Number(row.criteria_rides || 0),
    criteriaCheckpoints: Number(row.criteria_checkpoints || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
