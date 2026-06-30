
---

# CHAPTER 21 — AI PIPELINES & PROMPT ENGINEERING STRATEGY

## 21.1 Gemini Model Selection Strategy

| Use Case | Model | Rationale |
|---|---|---|
| Image analysis (Vision Agent) | `gemini-1.5-flash` | Fast, cost-effective, strong vision |
| Complex reasoning (Priority, Routing) | `gemini-1.5-pro` | Better reasoning for nuanced decisions |
| Executive Summary | `gemini-1.5-pro` | Long-context synthesis needed |
| Resolution verification (Before/After) | `gemini-1.5-flash` | Visual comparison is pattern recognition |
| Duplicate detection similarity | `gemini-1.5-flash` | Semantic embedding comparisons |
| Real-time agent commentary | `gemini-1.5-flash` | Speed matters for UX |

**Cost Optimization:** Flash for all P1/P2 issues, Pro reserved for P0 Critical and Executive Summaries.

## 21.2 Prompt Engineering Principles

### Principle 1: Structured Output Enforced
Every prompt ends with: *"Return ONLY valid JSON. No preamble. No markdown code blocks. No explanation outside the JSON object."*

This is enforced because:
- Inconsistent output formatting causes parsing failures that cascade through the pipeline
- JSON schema validation applied to every Gemini response before storage
- If parsing fails → agent marked `failed`, fallback applied

### Principle 2: Role + Context + Task + Format
Every system prompt follows this structure:
```
ROLE: "You are a [specific expert] for [specific platform]"
CONTEXT: "You are analyzing [specific data type] in [specific domain]"
TASK: "Your job is to [specific action] and return [specific output]"
FORMAT: "Return ONLY valid JSON matching this exact schema: {...}"
```

### Principle 3: Confidence Must Be Earned
Every prompt that returns a confidence score includes the calibration instruction:
```
"Confidence scoring guide:
90–100: You are certain. Visual evidence is unambiguous.
70–89: You are confident. One or more factors are unclear.
50–69: You have a reasonable interpretation but significant uncertainty.
Below 50: You are guessing. Flag this for human review."
```

### Principle 4: Failure Modes Specified
Each agent prompt includes explicit instructions for failure:
```
"If you cannot analyze the image because it is too blurry, unrelated to 
civic infrastructure, or depicts something inappropriate, return:
{ 'status': 'cannot_analyze', 'reason': '...' }
Do NOT attempt to guess."
```

### Principle 5: Citizen-Facing vs Official-Facing Language
Agents that generate text for users produce two versions:
- `citizenMessage`: Plain language, empathetic, under 50 words
- `officialNotes`: Technical, precise, includes measurements and regulatory references

---

# CHAPTER 22 — AUTHENTICATION & AUTHORIZATION

## 22.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────┐
│                  AUTHENTICATION FLOW                     │
│                                                         │
│  NEW USER                                               │
│  ──────────                                             │
│  1. Sign Up (email+password or Google OAuth)           │
│  2. Firebase Auth creates user account                  │
│  3. Firestore trigger: onCreate user document          │
│  4. Cloud Function: setCustomClaims({ role: null })    │
│  5. Onboarding: User selects role (Citizen/Official)   │
│  6. Official role: Requires department code            │
│  7. Cloud Function: validates code → sets role claim   │
│  8. Frontend: refreshes token to get new claims        │
│  9. Redirected to appropriate dashboard                 │
│                                                         │
│  RETURNING USER                                         │
│  ──────────────                                         │
│  1. Sign In (email+password or Google OAuth)           │
│  2. Firebase returns ID token (1hr expiry)             │
│  3. Frontend: stores token in memory (not localStorage)│
│  4. Auto-refresh: Firebase SDK handles silently        │
│  5. Token decoded client-side for role detection       │
│  6. Route guard reads role, redirects appropriately    │
└─────────────────────────────────────────────────────────┘
```

## 22.2 Authorization Model (RBAC)

| Resource | Citizen | Official | Admin |
|---|---|---|---|
| View any issue | ✅ | ✅ | ✅ |
| Create issue | ✅ | ✅ | ✅ |
| Verify issue | ✅ | ✅ | ✅ |
| View full agent reasoning | ✅ (own) | ✅ | ✅ |
| Update issue status | ❌ | ✅ (dept) | ✅ |
| Submit resolution | ❌ | ✅ (dept) | ✅ |
| View official dashboard | ❌ | ✅ | ✅ |
| View AI Situation Room | ❌ | ✅ | ✅ |
| Generate executive report | ❌ | limited | ✅ |
| Manage departments | ❌ | ❌ | ✅ |
| View all departments' issues | ❌ | own dept | ✅ |
| Override AI priority | ❌ | ✅ | ✅ |
| View agent logs | ❌ | ✅ | ✅ |

## 22.3 Anonymous Reporting

When a citizen submits anonymously:
- `reportedBy` field stored as `null` in Firestore
- Mapping stored in a separate `anonymousMapping` collection (Admin SDK only, not accessible to rules)
- Trust score bonuses not applied (anonymity forfeit)
- Verification flow still works (verified by community)
- Resolution notification sent to email if provided (optional)

---

# CHAPTER 23 — NOTIFICATION ARCHITECTURE

## 23.1 Notification Types

| Notification | Trigger | Recipient | Channel |
|---|---|---|---|
| Verification Request | New issue within 500m | Nearby citizens | FCM Push |
| Issue Verified | Verification threshold met | Reporter | FCM Push + In-app |
| Status Changed | Official updates status | Reporter | FCM Push + In-app |
| Assigned to Department | Pipeline completion | Dept officials | FCM Push |
| SLA Warning | 80% of SLA elapsed | Assigned official | FCM Push |
| SLA Breach | 100% of SLA elapsed | Official + Dept Head | FCM Push + Email |
| Resolution Verified | AI confirms resolution | Reporter | FCM Push + In-app |
| Badge Earned | Reputation milestone | Citizen | In-app |
| Daily Summary | 06:00 daily | Admins + Dept heads | FCM Push + In-app |
| Crisis Alert | P0 issue created | All officials in ward | FCM Push (high priority) |
| Ward Milestone | "50 issues resolved" | Ward citizens | FCM Push |

## 23.2 FCM Topic Architecture

```typescript
const topicSchema = {
  // All citizens in a ward receive ward-level notifications
  wardCitizens: `ward_${wardId}_citizens`,
  
  // All officials in a department
  departmentOfficials: `dept_${deptCode}_officials`,
  
  // All admins
  admins: `role_admin`,
  
  // Crisis alerts (all officials city-wide)
  crisisAlert: `city_${cityId}_crisis`,
  
  // Nearby verification requests (geo-based, managed via individual tokens)
  // Note: FCM doesn't support geo-fencing natively
  // Solution: Firestore geo query → individual token FCM multi-send
};
```

## 23.3 Notification Delivery Architecture

```
Issue Event (Firestore trigger)
        │
        ▼
onStatusChanged Cloud Function
        │
        ├── Determine notification type
        ├── Query reporter's FCM tokens (from users/{uid}/fcmTokens)
        ├── Build notification payload
        │   {
        │     notification: { title, body },
        │     data: { issueId, type, deepLink }  ← for in-app routing
        │   }
        └── fcmAdmin.sendMulticast(tokens, payload)
                │
                ├── Web browser push notification
                └── Store in Firestore notifications/{uid}/messages/{id}
                    (for in-app notification center)
```

---

# CHAPTER 24 — SEARCH ARCHITECTURE

## 24.1 Search by Text
- Firestore doesn't support full-text search natively
- **Solution for hackathon:** Basic compound query on `aiAnalysis.category + location.ward + status`
- **Production path:** Algolia or Typesense integration (document it in Future Roadmap)

## 24.2 Search by Location (Geo Queries)
Using **geohash-based range queries** since Firestore lacks native geo queries:

```typescript
// geohash precision 6 = ~1.2km radius
// geohash precision 7 = ~150m radius

function getNearbyIssueQuery(lat: number, lng: number, radiusKm: number) {
  const geohash = geohashForLocation([lat, lng]);
  const bounds = geohashQueryBounds([lat, lng], radiusKm * 1000);
  
  // Multiple range queries then merge client-side
  const queries = bounds.map(([start, end]) =>
    db.collection('issues')
      .orderBy('location.geohash')
      .startAt(start)
      .endAt(end)
  );
  
  return Promise.all(queries.map(q => q.get()));
}
```

## 24.3 Search by Image (Reverse Image Similarity)

**Implementation:**
1. User uploads comparison image
2. Vision Agent runs on uploaded image → extracts category, description
3. Query Firestore for issues matching category + ward
4. Display results as "Issues near you that look similar"

**Not true reverse image search** (vector embeddings) — but functionally equivalent for the hackathon, and the demo effect is the same.

**Gemini Enhancement:** Pass the uploaded image alongside 3 candidate issue descriptions to Gemini: *"Which of these reported issues best matches what is shown in this new photo?"*

---

# CHAPTER 25 — MAPS INTEGRATION

## 25.1 Google Maps Implementation

**Libraries loaded:**
```typescript
const { Map, Marker, InfoWindow, HeatmapLayer } = await loader.importLibrary('maps');
const { AdvancedMarkerElement } = await loader.importLibrary('marker');
const { visualization } = await loader.importLibrary('visualization'); // Heatmap
const { places } = await loader.importLibrary('places');               // Nearby landmarks
const { geocoder } = await loader.importLibrary('geocoding');          // Reverse geocoding
```

## 25.2 Issue Markers

**Custom marker design** using AdvancedMarkerElement with color-coded severity:
```typescript
function createIssueMarker(issue: Issue): AdvancedMarkerElement {
  const markerDiv = document.createElement('div');
  markerDiv.className = `issue-marker severity-${issue.priority.label.toLowerCase()}`;
  // Renders a circle with severity color + issue category icon
  
  return new AdvancedMarkerElement({
    map,
    position: { lat: issue.location.lat, lng: issue.location.lng },
    content: markerDiv,
    title: issue.aiAnalysis.subcategory,
    gmpClickable: true
  });
}
```

## 25.3 Clustering

Using **MarkerClusterer** library for grouping issues at zoom levels < 14:
- Cluster color = severity of highest-priority issue in cluster
- Cluster count displayed on marker
- Click → zoom to cluster → individual markers appear

## 25.4 Heatmap Layer

```typescript
// Pre-computed heatmap data fetched from communityStats/{wardId}
const heatmapData = wardStats.heatmapData.points.map(point => ({
  location: new google.maps.LatLng(point.lat, point.lng),
  weight: point.weight    // Based on issue count × severity multiplier
}));

const heatmap = new google.maps.visualization.HeatmapLayer({
  data: heatmapData,
  map: map,
  radius: 30,
  opacity: 0.7,
  gradient: [
    'rgba(0, 255, 255, 0)',
    'rgba(0, 255, 255, 1)',
    'rgba(0, 191, 255, 1)',
    'rgba(255, 165, 0, 1)',
    'rgba(255, 0, 0, 1)'
  ]
});
```

## 25.5 Geocoding & Reverse Geocoding

**On issue submission:**
```typescript
async function reverseGeocode(lat: number, lng: number): Promise<LocationData> {
  const geocoder = new google.maps.Geocoder();
  const response = await geocoder.geocode({ location: { lat, lng } });
  
  return {
    address: response.results[0].formatted_address,
    ward: extractComponent(response, 'sublocality_level_2'),
    city: extractComponent(response, 'locality'),
    nearbyLandmarks: await getNearbyPlaces(lat, lng)
  };
}
```

**Places API** used to enrich location with nearby schools, hospitals, transit stops — this powers Safety Agent's context factors ("near school zone").

## 25.6 Before/After Street View Integration

For resolved issues, the Issue Detail page shows Google Street View of the exact location:
```typescript
const panorama = new google.maps.StreetViewPanorama(container, {
  position: { lat: issue.location.lat, lng: issue.location.lng },
  pov: { heading: 0, pitch: 0 },
  zoom: 1,
  motionTracking: false
});
```

Combined with the Before/After photo slider, this creates a compelling resolution proof experience.

---

# CHAPTER 26 — ANALYTICS & HEATMAPS

## 26.1 Community Health Index Algorithm

The Community Health Index (CHI) is a composite score (0–100) for each ward, calculated hourly:

```typescript
function calculateCHI(wardStats: WardStats): number {
  const resolutionRate = wardStats.resolvedLast30Days / wardStats.total;
  const avgResolutionNormalized = Math.max(0, 1 - (wardStats.avgResolutionHours / 168));  // 168h = 1 week max
  const citizenEngagement = Math.min(1, wardStats.activeReporters / wardStats.population * 1000);
  const recurrenceRate = 1 - (wardStats.recurringIssueRate || 0);
  const slaCompliance = wardStats.slaComplianceRate;
  
  const chi = (
    resolutionRate * 35 +         // 35% weight: Are issues getting resolved?
    avgResolutionNormalized * 25 + // 25% weight: Are they resolved quickly?
    citizenEngagement * 15 +       // 15% weight: Is the community engaged?
    recurrenceRate * 15 +          // 15% weight: Are issues staying fixed?
    slaCompliance * 10             // 10% weight: Are officials meeting SLAs?
  );
  
  return Math.round(chi * 100);
}
```

**CHI Interpretation:**
- 80–100: 🟢 Thriving community
- 60–79: 🟡 Healthy, room for improvement
- 40–59: 🟠 Needs attention
- Below 40: 🔴 Critical intervention required

## 26.2 Analytics Dashboard Metrics

| Metric | Calculation | Display |
|---|---|---|
| Resolution Rate | resolved / total (last 30d) | % with trend arrow |
| Avg Resolution Time | mean(resolvedAt - createdAt) | Hours/Days |
| SLA Compliance | issues_within_sla / total | % by department |
| Top Issue Categories | group-by count | Donut chart |
| Issue Volume Trend | daily count last 30d | Line chart |
| Department Performance | resolution rate by dept | Ranked bar chart |
| Ward Heat Comparison | CHI by ward | Choropleth map |
| Citizen Participation | unique reporters / verifiers | Weekly trend |

## 26.3 Heatmap Generation (Scheduled)

Every hour, a Cloud Scheduler function rebuilds heatmap data:

```typescript
async function regenerateHeatmap(wardId: string): Promise<void> {
  const issues = await db.collection('issues')
    .where('location.ward', '==', wardId)
    .where('status', 'not-in', ['closed', 'duplicate'])
    .where('createdAt', '>', thirtyDaysAgo)
    .get();
  
  const heatmapPoints = issues.docs.map(doc => {
    const issue = doc.data();
    return {
      lat: issue.location.lat,
      lng: issue.location.lng,
      weight: priorityToWeight(issue.priority.level)
      // P0=10, P1=7, P2=4, P3=2, P4=1
    };
  });
  
  await db.collection('communityStats').doc(wardId).update({
    'heatmapData.points': heatmapPoints,
    'heatmapData.lastGenerated': FieldValue.serverTimestamp()
  });
}
```

---

# CHAPTER 27 — COMMUNITY VERIFICATION & REPUTATION ENGINE

## 27.1 Verification Logic

**Who can verify:**
- Authenticated citizen users
- Must be within 1km of issue location (client-side GPS check, server-side validation)
- Cannot verify their own report
- Cannot verify more than once per issue

**Verification weight by trust tier:**
```typescript
const verificationWeights = {
  new: 0.5,        // New accounts get half weight to prevent spam
  bronze: 0.75,
  silver: 1.0,     // Standard weight
  gold: 1.25,
  platinum: 1.5    // High-trust verifiers carry more weight
};
```

**Weighted verification threshold:**
```typescript
// A new user needs 5 confirmations to reach threshold
// A gold user's 3 confirmations equal the threshold
const verificationThreshold = 3.0;  // Weighted sum needed to unlock Priority escalation
```

**Anti-gaming measures:**
- Same IP address cannot submit > 3 verifications per hour
- Verification velocity checking (10+ verifications in 5 minutes → flag)
- Geographic validation (GPS coordinates must match issue location)
- Temporal validation (issue must be < 30 days old to verify)

## 27.2 Trust Score Algorithm

Trust score updates after each significant action:

```typescript
async function updateTrustScore(userId: string, action: TrustAction): Promise<void> {
  const delta = {
    // Positive actions
    report_verified_by_community: +15,    // Your report was confirmed
    verification_confirmed: +5,           // Your verification was proven correct
    report_resulted_in_resolution: +25,   // Issue you reported was resolved
    first_report_in_area: +10,            // You reported before anyone else
    duplicate_finder: +8,                 // You verified an existing report
    resolution_confirmed: +10,            // You confirmed resolution as accurate
    
    // Negative actions
    false_report: -30,                    // Your report was marked false
    incorrect_verification: -10,          // You verified a false report
    account_age_bonus: +1,               // +1 per month active
    
  }[action] || 0;
  
  await db.collection('users').doc(userId).update({
    'trust.score': FieldValue.increment(delta),
    'trust.lastUpdated': FieldValue.serverTimestamp()
  });
  
  // Recalculate tier
  await recalculateTrustTier(userId);
}

function scoresToTier(score: number): TrustTier {
  if (score >= 800) return 'platinum';
  if (score >= 500) return 'gold';
  if (score >= 200) return 'silver';
  if (score >= 50) return 'bronze';
  return 'new';
}
```

## 27.3 Badge System

| Badge | Trigger | Points Bonus |
|---|---|---|
| 🚀 First Report | First ever issue submitted | +20 |
| 🔍 Keen Eye | Reported a Hidden Issue (secondary detection) | +30 |
| 🌟 Community Pillar | 10 verified reports | +50 |
| 🛡 Fact Checker | 25 accurate verifications | +40 |
| ⚡ Fast Responder | Verified within 5min of notification | +15 |
| 🏆 Ward Champion | Top reporter in ward this month | +100 |
| 🤝 Resolver | Your report was resolved 5 times | +75 |
| 📍 Area Expert | 20 reports in same ward | +50 |
| 🔥 Streak | 7 consecutive days with activity | +30 |
| 🌍 City Hero | 100 verified reports total | +200 |

---

# CHAPTER 28 — PRIORITY SCORING & ROUTING ALGORITHMS

## 28.1 Full Priority Scoring Reference

```typescript
interface PriorityInputs {
  // From Vision Agent
  visionSeverity: 'critical' | 'high' | 'medium' | 'low';
  visionConfidence: number;         // 0–100
  hasImmediateRisk: boolean;
  contextFactors: string[];         // ['near_school', 'on_main_road', etc.]
  
  // From location context
  nearHospital: boolean;
  nearSchool: boolean;
  nearEmergencyRoute: boolean;
  trafficVolume: 'high' | 'medium' | 'low';
  
  // From community
  verificationCount: number;
  weightedVerificationSum: number;
  
  // From reporter
  reporterTrustScore: number;
  reporterFalsePositiveRate: number;
  
  // From environmental
  currentSeason: 'monsoon' | 'winter' | 'summer' | 'spring';
  weekday: boolean;
  
  // Historical
  similarIssueRecurrenceCount: number;
}

function calculatePriorityScore(inputs: PriorityInputs): number {
  let score = 0;
  
  // Severity base score (0–40)
  score += { critical: 40, high: 30, medium: 20, low: 10 }[inputs.visionSeverity];
  
  // Confidence penalty (reduce if Vision Agent was uncertain)
  if (inputs.visionConfidence < 70) score -= 5;
  if (inputs.visionConfidence < 50) score -= 10;
  
  // Safety risk bonus (0–25)
  if (inputs.hasImmediateRisk) score += 20;
  if (inputs.nearHospital || inputs.nearEmergencyRoute) score += 10;
  if (inputs.nearSchool) score += 8;
  
  // Population impact proxy (0–15)
  if (inputs.trafficVolume === 'high') score += 15;
  else if (inputs.trafficVolume === 'medium') score += 8;
  
  // Infrastructure decay risk (0–10)
  if (inputs.contextFactors.includes('structural_risk')) score += 10;
  if (inputs.similarIssueRecurrenceCount >= 3) score += 7;
  
  // Seasonal multiplier (0–5)
  if (inputs.currentSeason === 'monsoon' && 
      ['drainage', 'road_damage', 'flooding'].some(f => 
        inputs.contextFactors.includes(f))) {
    score += 5;
  }
  
  // Community validation bonus (0–5)
  score += Math.min(5, Math.floor(inputs.weightedVerificationSum));
  
  // Reporter trust bonus (0–5)
  if (inputs.reporterTrustScore >= 800) score += 5;
  else if (inputs.reporterTrustScore >= 500) score += 3;
  else if (inputs.reporterTrustScore >= 200) score += 1;
  
  // False positive penalty
  if (inputs.reporterFalsePositiveRate > 0.3) score -= 5;
  
  return Math.max(0, Math.min(100, score));
}
```

## 28.2 SLA Configuration

```typescript
const slaPolicies: Record<string, Record<number, number>> = {
  // Hours to resolve by priority level
  default: {
    0: 4,    // P0: 4 hours
    1: 24,   // P1: 24 hours
    2: 72,   // P2: 3 days
    3: 336,  // P3: 2 weeks
    4: 720   // P4: 30 days
  },
  'Water Supply & Sewerage': {
    0: 2,    // Water emergencies: 2 hours
    1: 8,
    2: 48,
    3: 168,
    4: 504
  },
  'Electrical Department': {
    0: 1,    // Electrical hazard: 1 hour
    1: 6,
    2: 48,
    3: 168,
    4: 504
  }
};
```

---

# CHAPTER 29 — OFFLINE SYNCHRONIZATION

## 29.1 Offline Strategy

Using **IndexedDB via idb library** with a sync queue pattern:

```typescript
// Offline-first report flow

// 1. User submits report offline
async function submitReportOffline(reportData: ReportDraft): Promise<string> {
  const tempId = `offline_${Date.now()}`;
  
  // Store in IndexedDB
  await offlineDB.add('pendingReports', {
    id: tempId,
    data: reportData,
    mediaBlob: reportData.mediaBlob,  // Store raw blob locally
    createdAt: Date.now(),
    syncStatus: 'pending'
  });
  
  // Register background sync (if supported)
  if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
    const registration = await navigator.serviceWorker.ready;
    await registration.sync.register('sync-reports');
  }
  
  return tempId;
}

// 2. Service Worker handles background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncPendingReports());
  }
});

// 3. Sync function: upload media → submit to Firestore
async function syncPendingReports(): Promise<void> {
  const pending = await offlineDB.getAll('pendingReports');
  
  for (const report of pending) {
    try {
      // Upload media to Firebase Storage
      const mediaUrl = await uploadToStorage(report.mediaBlob);
      
      // Submit to Cloud Function
      const { issueId } = await submitIssue({ ...report.data, mediaUrl });
      
      // Remove from IndexedDB on success
      await offlineDB.delete('pendingReports', report.id);
      
      // Show notification
      self.registration.showNotification('Report Synced!', {
        body: `Your issue report has been submitted. Issue #${issueId}`,
        icon: '/icons/icon-192.png'
      });
    } catch (error) {
      // Leave in queue, retry on next sync
      await offlineDB.put('pendingReports', { ...report, syncStatus: 'failed', lastError: error.message });
    }
  }
}
```

## 29.2 What Works Offline

| Feature | Offline | Sync on Reconnect |
|---|---|---|
| Write report draft | ✅ | ✅ |
| Take photo / record video | ✅ | ✅ |
| View previously loaded issues | ✅ (cached) | auto-refresh |
| Submit verification | ✅ (queued) | ✅ |
| View own badges | ✅ (cached) | auto-refresh |
| View map | ❌ (requires tiles) | n/a |
| Run AI analysis | ❌ (requires Gemini) | on submit |

---

# CHAPTER 30 — DEPLOYMENT ARCHITECTURE

## 30.1 Infrastructure Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CIVICMIND DEPLOYMENT ARCHITECTURE                 │
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    GOOGLE CLOUD / FIREBASE                    │    │
│  │                                                               │    │
│  │  ┌───────────────┐    ┌───────────────┐   ┌──────────────┐ │    │
│  │  │ Firebase       │    │  Firestore    │   │  Firebase    │ │    │
│  │  │ Hosting        │    │  (Database)   │   │  Storage     │ │    │
│  │  │                │    │               │   │              │ │    │
│  │  │ React App      │    │ Real-time     │   │ Media files  │ │    │
│  │  │ (CDN-served)   │    │ sync to all   │   │ Thumbnails   │ │    │
│  │  │ PWA manifest   │    │ clients       │   │              │ │    │
│  │  └───────┬────────┘    └───────┬───────┘   └──────┬───────┘ │    │
│  │          │                     │                   │          │    │
│  │          └──────────────────── │ ──────────────────┘          │    │
│  │                                │                               │    │
│  │                         ┌──────▼────────┐                     │    │
│  │                         │ Cloud          │                     │    │
│  │                         │ Functions      │                     │    │
│  │                         │ (Gen 2)        │                     │    │
│  │                         │                │                     │    │
│  │                         │ • Pipeline     │                     │    │
│  │                         │   Orchestrator │                     │    │
│  │                         │ • 8 Agents     │                     │    │
│  │                         │ • Triggers     │                     │    │
│  │                         │ • HTTP APIs    │                     │    │
│  │                         └──────┬─────────┘                    │    │
│  │                                │                               │    │
│  │          ┌─────────────────────┼─────────────────────┐        │    │
│  │          │                     │                       │        │    │
│  │   ┌──────▼──────┐    ┌────────▼────────┐   ┌────────▼──────┐ │    │
│  │   │  Gemini API  │    │  Firebase Auth  │   │  Cloud FCM    │ │    │
│  │   │  (Vision +   │    │  (JWT + Claims) │   │  (Push Notif) │ │    │
│  │   │   Pro Flash) │    │                 │   │               │ │    │
│  │   └─────────────┘    └─────────────────┘   └───────────────┘ │    │
│  │                                                                │    │
│  │   ┌─────────────┐    ┌─────────────────┐                      │    │
│  │   │ Cloud        │    │  Google Maps    │                      │    │
│  │   │ Scheduler   │    │  APIs           │                      │    │
│  │   │ (daily jobs) │    │  (JS + Geocode) │                      │    │
│  │   └─────────────┘    └─────────────────┘                      │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## 30.2 Firebase Project Configuration

```
Firebase Project: civicmind-ai-prod
├── Authentication
│   └── Providers: Email/Password, Google
├── Firestore
│   └── Region: us-central1 (lowest latency for global demo)
│   └── Mode: Production (with security rules)
├── Storage
│   └── Bucket: civicmind-ai-prod.appspot.com
│   └── Rules: authenticated write, public read for resolved media
├── Functions
│   └── Runtime: nodejs20
│   └── Region: us-central1
│   └── Min instances: 1 (prevent cold start for demo)
├── Hosting
│   └── Site: civicmind-ai
│   └── Rewrite: /* → /index.html (SPA)
└── FCM
    └── VAPID key configured for web push
```

## 30.3 Environment Variables

```bash
# Frontend (.env — committed with placeholder values)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_GOOGLE_MAPS_API_KEY=
VITE_APP_ENV=production

# Cloud Functions (.env — NEVER committed)
GEMINI_API_KEY=
GOOGLE_MAPS_SERVER_API_KEY=
ADMIN_NOTIFICATION_EMAIL=
```

## 30.4 Deployment Commands

```bash
# Initial setup
npm install -g firebase-tools
firebase login
firebase init

# Frontend build + deploy
cd civicmind-frontend
npm run build
firebase deploy --only hosting

# Functions deploy
cd civicmind-functions
npm run build
firebase deploy --only functions

# Deploy everything
firebase deploy

# Deploy with targets
firebase deploy --only firestore:rules,firestore:indexes,storage:rules
```

---

# CHAPTER 31 — MONITORING & LOGGING

## 31.1 Logging Strategy

All Cloud Functions use structured logging:
```typescript
import { logger } from 'firebase-functions/v2';

logger.info('Pipeline started', {
  issueId,
  pipelineId,
  stage: 'vision_agent',
  metadata: { imageSize, reporterTrustScore }
});

logger.error('Agent failed', {
  agentId: 'priority',
  issueId,
  error: error.message,
  fallbackApplied: true
});
```

Logs appear in **Google Cloud Logging** (accessible via Firebase Console → Functions → Logs).

## 31.2 Key Metrics to Monitor

| Metric | Alert Threshold | Monitoring Tool |
|---|---|---|
| Pipeline success rate | < 90% | Cloud Monitoring |
| Gemini API error rate | > 5% | Cloud Monitoring |
| Pipeline execution time | > 30s | Cloud Monitoring |
| Firestore read cost | > budget | Cloud Monitoring |
| Authentication failures | Spike | Firebase Console |
| FCM delivery rate | < 85% | Firebase Console |
| Storage upload failures | > 2% | Cloud Monitoring |

## 31.3 Error Handling Standards

Every Cloud Function follows this pattern:
```typescript
try {
  // main logic
} catch (error) {
  if (error instanceof GeminiError) {
    // Graceful degradation: use fallback classification
    logger.warn('Gemini unavailable, using fallback', { issueId, error });
    return applyFallbackAnalysis(issueData);
  }
  
  if (error instanceof FirestoreError) {
    // Retry with exponential backoff
    await exponentialBackoff(() => retryOperation(), maxRetries: 3);
  }
  
  // For unrecoverable errors: log, notify admin, don't crash
  logger.error('Unrecoverable error', { issueId, error: error.message });
  await notifyAdminOfFailure(issueId, error);
  throw error;  // Let Firebase handle retry for triggered functions
}
```

---

# CHAPTER 32 — CI/CD STRATEGY

## 32.1 Repository Structure

```
civicmind-ai/
├── packages/
│   ├── frontend/          # React app
│   ├── functions/         # Cloud Functions
│   └── shared/            # Shared TypeScript types
├── .github/
│   └── workflows/
│       ├── deploy-staging.yml
│       └── deploy-production.yml
├── firebase.json
├── .firebaserc
└── package.json           # Monorepo root
```

## 32.2 GitHub Actions Pipeline

```yaml
# .github/workflows/deploy-production.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Type check
        run: npm run typecheck --workspaces
      
      - name: Run tests
        run: npm test --workspaces
      
      - name: Build frontend
        run: npm run build -w frontend
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
          VITE_GOOGLE_MAPS_API_KEY: ${{ secrets.MAPS_API_KEY }}
      
      - name: Build functions
        run: npm run build -w functions
      
      - name: Deploy to Firebase
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: ${{ secrets.GITHUB_TOKEN }}
          firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          channelId: live
```

---

# CHAPTER 33 — FOLDER STRUCTURE & CODING STANDARDS

## 33.1 Code Style Rules

| Rule | Standard |
|---|---|
| Language | TypeScript strict mode (`"strict": true`) |
| Formatter | Prettier with 2-space indent |
| Linter | ESLint with `@typescript-eslint` |
| Import order | External → Internal → Relative (enforced by ESLint) |
| Naming: Components | PascalCase (`IssueCard.tsx`) |
| Naming: Functions | camelCase (`calculatePriorityScore`) |
| Naming: Types/Interfaces | PascalCase with descriptive suffix (`IssueDocument`, `VisionAgentResult`) |
| Naming: Constants | SCREAMING_SNAKE_CASE (`MAX_VERIFICATION_RADIUS_KM`) |
| File size | Max 300 lines (prefer splitting) |
| Comments | JSDocs on all exported functions and types |
| Error messages | User-facing in plain English, developer-facing with codes |

## 33.2 Component Rules

- All components export as named exports AND default export
- Props typed as `interface ComponentNameProps`
- No inline styles (Tailwind classes only)
- Accessibility: all interactive elements have `aria-label` or `aria-labelledby`
- All map interactions have keyboard alternatives

---

# CHAPTER 34 — TESTING STRATEGY

## 34.1 Test Pyramid

```
        ┌─────────────────────┐
        │    E2E Tests (5%)    │  Playwright: Full user journeys
        │  "Report → Verify"  │  (run before hackathon submission)
        └────────────┬────────┘
                     │
        ┌────────────▼──────────────┐
        │    Integration Tests (20%) │  Firebase Emulator + Jest
        │  "Pipeline runs correctly" │  Cloud Functions + Firestore
        └────────────┬──────────────┘
                     │
        ┌────────────▼───────────────────────┐
        │         Unit Tests (75%)            │  Jest + React Testing Library
        │  "Priority algorithm correct"       │  Pure functions, components
        │  "Agent result parsing correct"     │
        └────────────────────────────────────┘
```

## 34.2 Critical Test Cases

| Test | Description | Priority |
|---|---|---|
| Priority Score Calculation | Unit test all edge cases of scoring algorithm | P0 |
| Agent Pipeline Completion | Integration test full pipeline with mock Gemini | P0 |
| Duplicate Detection | Unit test geohash proximity matching | P0 |
| Firestore Security Rules | Test each rule allows/denies correctly | P0 |
| Offline Sync | Test IndexedDB → sync on reconnect | P1 |
| Resolution Verification | Mock Gemini response, verify verdict flow | P0 |
| FCM Notification Delivery | Mock FCM, verify correct recipients | P1 |

## 34.3 Firebase Local Emulator Setup

```bash
# Start all emulators for local development
firebase emulators:start --import=./emulator-data --export-on-exit

# Seed test data
npx ts-node scripts/seed-emulator.ts

# Run tests against emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 npm test
```

---

# CHAPTER 35 — RISK ANALYSIS

## 35.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Gemini API rate limits hit during demo | Medium | High | Pre-cache demo responses; use recorded pipeline for demo |
| Google Maps billing exceeded | Low | Medium | Set strict API quotas; use development key with domain restriction |
| Firestore cold start delays | Low | Medium | Use min-instances=1 for critical functions |
| Pipeline timeout (>540s) | Low | High | Parallel agents where possible; 30s Gemini timeout |
| Image too large / corrupted | Medium | Medium | Client-side compression before upload; server-side validation |
| FCM delivery failure | Low | Low | In-app notification center as fallback |
| Geolocation permission denied | Medium | Medium | Manual address entry fallback |
| Offline sync conflicts | Low | Medium | Last-write-wins with timestamp; conflict log for review |

## 35.2 Demo-Day Risks

| Risk | Mitigation |
|---|---|
| Slow internet at demo venue | Pre-load demo data; enable offline mode; use 4G hotspot |
| Gemini unavailable | Pre-recorded agent pipeline animation as fallback |
| Firestore latency spike | Deploy min-instances; keep demo data small |
| Maps API key invalid | Test key the night before; have backup key ready |
| Demo device issue | Test on 3 different devices; have backup screenshots |

---

# CHAPTER 36 — DEMO SCRIPT & HACKATHON PITCH STRATEGY

## 36.1 Pitch Opening (60 seconds)

> "Every day, millions of citizens walk past potholes, broken streetlights, and burst pipes — and nothing happens. Not because they don't care. Because reporting a civic issue today feels like shouting into a void. You call 311 and wait on hold. You submit a web form and hear nothing. You give up.
> 
> We built CivicMind AI. Not a complaint portal. Not a ticketing system. An AI Operating System for city governance — where eight specialized AI agents collaborate to detect, verify, prioritize, route, predict, and resolve community issues in minutes, not months.
> 
> Let me show you."

## 36.2 Demo Flow (8 minutes)

### Minute 1–2: Citizen Reporting
1. Open mobile app (live device or large screen)
2. Tap "Report Issue" → Camera
3. Photograph a real pothole image (pre-staged)
4. **Pause here:** "Watch what happens next — no other civic platform does this."
5. Watch Gemini Vision analyze: category, severity, secondary issue detection
6. Show confidence score: 94%
7. "It found a drainage blockage in the corner that I didn't even mention."

### Minute 3–4: AI Agent Pipeline
1. Submit the issue
2. Navigate to Pipeline Viewer (SCR-14)
3. Watch all 8 agents fire in sequence with reasoning
4. **Stop on Priority Agent:** "It's calculating 14 different factors to determine this is a P1 — High Priority — near a school zone during the school run."
5. **Stop on Safety Agent:** "Our Safety Agent independently reviewed this and confirmed the priority. It has veto power — if there was an electrical hazard, it would have overridden everything to P0 Critical."
6. Final result: "Assigned to Roads Department. SLA: 24 hours."

### Minute 5: Community & Maps
1. Show Explore Map with heatmap
2. Point out a cluster of red markers
3. "These 7 issues are in the same 200-meter radius — our Root Cause Analysis Agent flagged this as likely indicating an aging road segment needing resurfacing, not individual pothole repairs."
4. Show Community Verification: "3 neighbors confirmed this issue within 10 minutes of submission."

### Minute 6: Official Dashboard
1. Switch to Official view
2. Show AI Situation Room
3. Highlight the live agent feed
4. "Officials see not just a list of complaints — they see a real-time intelligence center. Every issue has reasoning, every priority has justification. No more guesswork."

### Minute 7: Resolution Loop
1. Show official submitting resolution photo
2. Watch Resolution Agent compare Before/After
3. "Our AI just verified this pothole was actually filled. No rubber-stamping. Real verification."
4. Show citizen receiving notification: "Your issue has been resolved. Here's the proof."

### Minute 8: Impact
1. Show Community Health Index: 72/100 → improving trend
2. "This ward's health score has gone up 8 points this month. Resolution rate: 84%. Average resolution time: 18 hours — down from 6 weeks."
3. Close: "CivicMind AI isn't just about reporting problems. It's about building cities where every citizen's voice is amplified by eight AI agents — and every problem that can be seen, gets solved."

## 36.3 Judge Questions & Answers

| Question | Answer |
|---|---|
| "Why not just use ChatGPT?" | "We need structured, verifiable, role-specific AI reasoning in a civic context. Gemini's multimodal vision capability is central — we're analyzing physical infrastructure from images, which requires a specific model. And our 8-agent design means each decision is auditable, not a black box." |
| "How does this scale?" | "Firestore and Cloud Functions auto-scale with zero configuration. The architecture supports 10M+ users without any infrastructure changes. Each agent runs as a separate function — 100 parallel pipelines at once." |
| "What's the business model?" | "SaaS licensing to municipal corporations — ₹15–50L per city per year, far cheaper than hiring additional administrative staff. We also open-source the citizen app to maximize adoption." |
| "What's your moat?" | "Community data network effect. Every verification, every trust score, every issue pattern improves the AI's accuracy. After 6 months in a city, our Priority Agent is tuned to that city's specific infrastructure patterns — a competitor starting fresh can't replicate that." |
| "How do you handle false reports?" | "Three-layer filtering: Gemini Vision sanity check, community verification with weighted trust scores, and our Safety Agent pattern analysis. False positive rate in similar systems drops to < 5% with community verification." |

---

# CHAPTER 37 — FUTURE ROADMAP (P3)

## 37.1 6-Month Roadmap

### Phase 1 (Months 1–2): Production Hardening
- BigQuery integration for analytics at scale
- Algolia for full-text search
- Multi-city deployment with city-specific AI tuning
- Native iOS + Android apps (React Native)
- Multi-language support (Hindi, regional languages)

### Phase 2 (Months 3–4): Intelligence Expansion
- **Digital Twin:** 3D city model showing infrastructure health as a live overlay
- **Predictive Budget AI:** ML model predicting maintenance costs 6 months out
- **Seasonal Forecasting:** Monsoon preparation intelligence
- **IoT Integration:** Smart sensors feeding directly into the pipeline
- **Satellite Imagery Analysis:** Gemini Vision on satellite photos for proactive detection

### Phase 3 (Months 5–6): Ecosystem
- **Open API** for third-party integrations (insurance, urban planning)
- **Citizen Assembly Mode:** AI-facilitated community decision-making on large projects
- **Emergency Response Integration:** Direct escalation to police/fire/ambulance
- **Smart Camera Network:** Existing CCTV feeds into Vision Agent for proactive detection
- **Carbon Impact Tracker:** Measure environmental impact of infrastructure issues

## 37.2 Replication Mode

Any city can deploy CivicMind AI in < 4 hours:

1. Create Firebase project
2. Run `civicmind deploy --city "Chennai" --state "Tamil Nadu"`
3. Configure departments and ward boundaries (CSV import)
4. Customize AI routing matrix for local department structure
5. Set SLA policies per department
6. Launch citizen app with city branding

The AI agents automatically tune to local patterns after 30 days of data.

## 37.3 Technology Evolution Path

| Current (Hackathon) | 6 Months | 2 Years |
|---|---|---|
| Gemini Flash/Pro API | Fine-tuned Gemini on civic data | Custom civic AI foundation model |
| Firestore | Firestore + BigQuery | Unified analytics data warehouse |
| Cloud Functions | Cloud Run (containerized) | Multi-region Kubernetes |
| FCM Push | Omnichannel (WhatsApp, SMS, email) | AI-personalized notification timing |
| Manual routing matrix | ML-learned routing | Self-tuning routing per city |
| Static heatmaps | Real-time streaming heatmaps | Predictive risk maps |

---

# APPENDIX A — GOOGLE TECHNOLOGIES SUMMARY

| Technology | Role in CivicMind | Why Chosen |
|---|---|---|
| **Gemini 1.5 Flash** | Vision Agent, Duplicate, Resolution | Fast, multimodal, cost-effective |
| **Gemini 1.5 Pro** | Priority Agent, Executive Summary | Better reasoning for complex decisions |
| **Firebase Authentication** | User identity, role claims | Zero-config, multi-provider, secure |
| **Firestore** | Primary database, real-time sync | Real-time listeners, serverless, scales |
| **Firebase Storage** | Issue media, resolution photos | Integrated with Firestore, CDN-backed |
| **Cloud Functions (Gen 2)** | Agent pipeline, event triggers, APIs | Serverless, high concurrency, auto-scale |
| **Firebase Cloud Messaging** | Push notifications | Cross-platform, topic-based, reliable |
| **Cloud Scheduler** | Daily executive summaries, heatmap refresh | Managed cron, serverless |
| **Firebase Hosting** | React app serving | CDN, instant deploy, custom domain |
| **Google Maps JavaScript API** | Interactive issue map | Market standard, rich clustering |
| **Geocoding API** | Convert GPS to address | Accurate, reverse geocoding support |
| **Places API** | Nearby landmarks for context | Enriches Safety Agent decisions |
| **Maps Heatmap Visualization** | Issue density visualization | Native Google Maps feature |
| **Vertex AI** (future) | Fine-tuned civic AI models | Custom model training on our data |
| **BigQuery** (future) | City-scale analytics | Petabyte analytics, SQL interface |

---

# APPENDIX B — ISSUE CATEGORY TAXONOMY

```typescript
type IssueCategory = 
  | 'road_damage'         // Potholes, cracks, road erosion
  | 'water_issue'         // Leaks, flooding, contamination, low pressure
  | 'electricity'         // Streetlights, exposed wires, transformer issues
  | 'waste_management'    // Garbage, illegal dumping, overflowing bins
  | 'public_safety'       // Broken railings, missing manhole covers, signage
  | 'green_spaces'        // Fallen trees, park maintenance, encroachments
  | 'drainage'            // Blocked drains, sewage overflow
  | 'public_property'     // Vandalism, graffiti, broken benches
  | 'noise_pollution'     // Construction noise, loudspeaker violation
  | 'air_quality'         // Burning, industrial smoke
  | 'animal_control'      // Stray animals, vermin infestation
  | 'other';              // Catch-all with mandatory description
```

---

# APPENDIX C — DEPARTMENT CONFIGURATION TEMPLATE

```typescript
const departmentTemplate: DepartmentDocument[] = [
  {
    id: 'roads',
    name: 'Roads & Infrastructure Department',
    code: 'ROADS',
    categories: ['road_damage', 'drainage', 'public_property'],
    sla: { critical: 4, high: 24, medium: 72, low: 336, informational: 720 }
  },
  {
    id: 'water',
    name: 'Water Supply & Sewerage Board',
    code: 'WATER',
    categories: ['water_issue', 'drainage'],
    sla: { critical: 2, high: 8, medium: 48, low: 168, informational: 504 }
  },
  {
    id: 'electricity',
    name: 'Electrical Department',
    code: 'ELEC',
    categories: ['electricity'],
    sla: { critical: 1, high: 6, medium: 48, low: 168, informational: 504 }
  },
  {
    id: 'swm',
    name: 'Solid Waste Management',
    code: 'SWM',
    categories: ['waste_management', 'green_spaces'],
    sla: { critical: 4, high: 24, medium: 72, low: 336, informational: 720 }
  },
  {
    id: 'parks',
    name: 'Parks & Green Spaces Department',
    code: 'PARKS',
    categories: ['green_spaces', 'public_property'],
    sla: { critical: 8, high: 48, medium: 120, low: 504, informational: 1440 }
  }
];
```

---

# APPENDIX D — CRITICAL IMPLEMENTATION CHECKLIST

## P0 Features — Must Be Functional for Demo

- [ ] Firebase project configured and deployed
- [ ] Authentication (email + Google OAuth) working
- [ ] Role selection and custom claims working
- [ ] Image upload to Firebase Storage working
- [ ] Gemini Vision API call returning structured JSON
- [ ] Firestore issue document creation working
- [ ] Cloud Function trigger on issue creation working
- [ ] All 8 agents writing to Firestore agentResults subcollection
- [ ] Frontend PipelineViewer reacting to Firestore onSnapshot in real-time
- [ ] Google Maps rendering with issue markers
- [ ] Heatmap layer toggling on map
- [ ] Official dashboard showing AI-sorted issue queue
- [ ] Status update from official working + citizen notified
- [ ] Resolution photo upload triggering Resolution Agent
- [ ] Before/After comparison working in Issue Detail
- [ ] Community Health Index calculating and displaying
- [ ] Executive Summary generation working
- [ ] AI Situation Room showing live map + agent feed

## P1 Features — Target for Demo Polish

- [ ] Offline report submission (IndexedDB queue)
- [ ] Background sync when reconnected
- [ ] Voice input for issue description
- [ ] Leaderboard populating from Firestore
- [ ] Badge award on trust milestone
- [ ] FCM push notifications for status changes
- [ ] Root Cause Analysis for issue clusters
- [ ] Impact Calculator on issue detail

---

*This document is version 1.0.0 of the CivicMind AI Software Design Document.*
*Last updated: Hackathon Day 0*
*Next review: After Day 1 sprint checkpoint*

**Document Owner:** CivicMind AI Team
**Status:** ACTIVE BLUEPRINT — Coding agents should implement directly from this specification.

---
> **For AI Coding Agents:** Begin with `APPENDIX D — CRITICAL IMPLEMENTATION CHECKLIST`. 
> Implement P0 items in order. Do not proceed to P1 until all P0 items are checked.
> All Firestore schema definitions in Chapter 17 are the authoritative data contracts.
> All agent result TypeScript interfaces in Chapter 16 define the exact shape of data to be written.
