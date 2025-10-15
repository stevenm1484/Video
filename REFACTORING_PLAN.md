# AlarmDetail.jsx Refactoring Plan

## Current State Analysis

**File**: `/var/www/videomonitoring/frontend/src/pages/AlarmDetail.jsx`

### Metrics
- **Lines of Code**: 3,448
- **Characters**: 127,983
- **State Variables**: 26
- **useEffect Hooks**: 8
- **useRef Hooks**: 9
- **API Calls**: 39
- **WebSocket References**: 19
- **Style Definitions**: 171

### Complexity Issues

1. **Single Massive Component**: All logic in one 3,448-line file
2. **Mixed Concerns**: UI, business logic, WebSocket handling, HLS video streaming, and styling all in one place
3. **Difficult Maintenance**: Hard to find specific functionality, risky to modify
4. **No Code Reuse**: Patterns repeated (camera streaming, event handling) not extracted
5. **Testing Challenges**: Cannot unit test individual pieces
6. **Performance**: Large component re-renders entirely on any state change

---

## Recommended Refactoring Strategy

### Phase 1: Extract Styles (Low Risk, High Reward)
**Goal**: Move 171 style definitions out of component

**Create**: `src/pages/AlarmDetail/styles.js`
```javascript
export const alarmDetailStyles = {
  // All 171 styles here
}
```

**Benefits**:
- Reduces main file by ~1,200 lines (35% reduction)
- Improves readability
- Enables style reuse
- Easy to implement, low risk

**Effort**: 1-2 hours

---

### Phase 2: Extract Custom Hooks (Medium Risk, High Value)
**Goal**: Separate stateful logic from UI

#### 2a. Video Streaming Hook
**Create**: `src/pages/AlarmDetail/hooks/useVideoStream.js`

**Extracts**:
- HLS initialization logic
- Stream start/stop logic
- Camera switching logic
- Grid view management
- ~200 lines

```javascript
export function useVideoStream(cameraId, videoRef) {
  const [streamUrl, setStreamUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  // ... HLS setup logic
  return { streamUrl, loading, startStream, stopStream }
}
```

#### 2b. WebSocket Event Hook
**Create**: `src/pages/AlarmDetail/hooks/useAlarmWebSocket.js`

**Extracts**:
- WebSocket connection management
- Event message handling
- New event notifications
- ~150 lines

```javascript
export function useAlarmWebSocket(alarmId, accountId, onNewEvent) {
  const wsRef = useRef(null)
  // ... WebSocket logic
  return { isConnected, sendMessage }
}
```

#### 2c. Action Plan State Hook
**Create**: `src/pages/AlarmDetail/hooks/useActionPlan.js`

**Extracts**:
- Action plan state management
- Step completion tracking
- API updates for action plan
- ~100 lines

```javascript
export function useActionPlan(alarmId, initialState) {
  const [actionPlanState, setActionPlanState] = useState(initialState)
  const toggleStep = (stepId) => { /* ... */ }
  return { actionPlanState, toggleStep, updateAnswer }
}
```

**Benefits**:
- Testable logic units
- Reusable across components
- Clearer separation of concerns
- Reduces main file by ~450 lines

**Effort**: 4-6 hours

---

### Phase 3: Extract UI Components (Medium-High Risk, Very High Value)
**Goal**: Break down monolithic UI into composable components

#### 3a. Media Player Component
**Create**: `src/pages/AlarmDetail/components/MediaPlayer.jsx`

**Props**:
```javascript
{
  mediaPaths: string[],
  mediaType: 'image' | 'video',
  selectedIndex: number,
  onIndexChange: (index) => void,
  timestamp: string,
  timezone: string
}
```

**Extracts**:
- Video/image display
- Thumbnail navigation
- ~150 lines

#### 3b. Events Timeline Component
**Create**: `src/pages/AlarmDetail/components/EventsTimeline.jsx`

**Props**:
```javascript
{
  events: AlarmEvent[],
  selectedIndex: number,
  onEventSelect: (index) => void,
  newEventIds: number[],
  timezone: string
}
```

**Extracts**:
- Vertical timeline rendering
- Event cards with thumbnails
- Selection handling
- ~200 lines

#### 3c. Live Camera Feed Component
**Create**: `src/pages/AlarmDetail/components/LiveCameraFeed.jsx`

**Props**:
```javascript
{
  cameras: Camera[],
  selectedCameraId: number,
  onCameraChange: (id) => void,
  viewMode: 'single' | 'grid',
  onViewModeChange: (mode) => void,
  fromHistory: boolean
}
```

**Uses**: `useVideoStream` hook

**Extracts**:
- Live video display
- Camera selector dropdown
- Grid/single view toggle
- ~250 lines

#### 3d. Action Plan Component
**Create**: `src/pages/AlarmDetail/components/ActionPlan.jsx`

**Props**:
```javascript
{
  actionPlan: ActionPlanStep[],
  actionPlanState: object,
  onToggleStep: (stepId) => void,
  onAnswerQuestion: (stepId, answer) => void,
  fromHistory: boolean
}
```

**Uses**: `useActionPlan` hook

**Extracts**:
- Checklist rendering
- Boolean questions (YES/NO)
- Conditional branching logic
- Nested steps
- Webhook triggers
- ~600 lines (largest component)

#### 3e. Contacts Panel Component
**Create**: `src/pages/AlarmDetail/components/ContactsPanel.jsx`

**Props**:
```javascript
{
  contacts: Contact[],
  callLogs: CallLog[],
  onCall: (contact) => void,
  timezone: string,
  fromHistory: boolean
}
```

**Extracts**:
- Contact cards
- Call buttons
- Call log history display
- ~200 lines

#### 3f. Notes and Actions Component
**Create**: `src/pages/AlarmDetail/components/NotesActions.jsx`

**Props**:
```javascript
{
  notes: string,
  resolution: string,
  onNotesChange: (notes) => void,
  onResolutionChange: (resolution) => void,
  onResolve: () => void,
  onDismiss: () => void,
  onRevert: () => void,
  fromHistory: boolean,
  alarm: Alarm
}
```

**Extracts**:
- Notes textarea
- Resolution dropdown
- Action buttons (Resolve, Dismiss, Revert, Hold, Escalate)
- ~200 lines

#### 3g. Call Modal Component
**Create**: `src/pages/AlarmDetail/components/CallModal.jsx`

**Already exists** but verify integration

#### 3h. Grid View Modal Component
**Create**: `src/pages/AlarmDetail/components/GridViewModal.jsx`

**Currently inline** (function CameraGridModalForAlarm, line 2164)

**Extracts**: ~150 lines

**Benefits**:
- Each component is < 300 lines
- Components are testable
- Can be reused in other parts of app
- Reduces main file by ~1,750 lines
- Much easier to understand and modify

**Effort**: 10-15 hours

---

### Phase 4: Organize File Structure (Low Risk, High Maintainability)
**Goal**: Clear folder organization

#### Proposed Structure:
```
src/pages/AlarmDetail/
├── index.js                         # Main export
├── AlarmDetail.jsx                  # Main orchestrator (~500 lines)
├── styles.js                        # All styles
├── hooks/
│   ├── useVideoStream.js
│   ├── useAlarmWebSocket.js
│   ├── useActionPlan.js
│   └── useAlarmData.js              # Fetch alarm/event/camera data
├── components/
│   ├── MediaPlayer.jsx
│   ├── EventsTimeline.jsx
│   ├── LiveCameraFeed.jsx
│   ├── ActionPlan/
│   │   ├── index.jsx
│   │   ├── ActionPlanStep.jsx
│   │   ├── BooleanQuestion.jsx
│   │   └── ConditionalBranch.jsx
│   ├── ContactsPanel.jsx
│   ├── NotesActions.jsx
│   ├── CallModal.jsx
│   ├── GridViewModal.jsx
│   └── AlarmHeader.jsx              # Account info, snooze, etc.
└── utils/
    ├── streamHelpers.js             # HLS setup utilities
    └── eventHelpers.js              # Event formatting
```

**Benefits**:
- Clear separation of concerns
- Easy to find specific functionality
- Enables team collaboration (different files)
- Standard React patterns

**Effort**: 2-3 hours (mostly file moves after Phase 3)

---

## Implementation Roadmap

### Week 1: Foundation
- **Day 1-2**: Phase 1 - Extract styles
- **Day 3-4**: Phase 2a - Video streaming hook
- **Day 5**: Test and verify no regressions

### Week 2: Logic Extraction
- **Day 1-2**: Phase 2b - WebSocket hook
- **Day 3-4**: Phase 2c - Action Plan hook
- **Day 5**: Test and verify

### Week 3-4: Component Extraction
- **Day 1-2**: Phase 3a,b - MediaPlayer + EventsTimeline
- **Day 3-4**: Phase 3c - LiveCameraFeed
- **Day 5-6**: Phase 3d - ActionPlan (most complex)
- **Day 7-8**: Phase 3e,f - ContactsPanel + NotesActions
- **Day 9-10**: Test, refine, verify

### Week 5: Organization
- **Day 1-2**: Phase 4 - File structure
- **Day 3-5**: Documentation, final testing

**Total Effort**: ~80-100 hours (2-3 weeks for one developer)

---

## Risk Mitigation

### Testing Strategy
1. **Regression Testing**: Test all functionality after each phase
2. **Incremental Changes**: Commit after each component extraction
3. **Feature Flags**: Could add flag to toggle between old/new implementation
4. **User Acceptance**: Test with actual users after Phase 3

### Rollback Plan
- Keep original AlarmDetail.jsx as AlarmDetail.legacy.jsx
- Use git branches for each phase
- Can revert to original at any point

### Priority if Time-Constrained
If full refactoring is too time-consuming:

**Minimum Viable Refactoring** (1 week):
1. Phase 1: Extract styles (immediate 35% size reduction)
2. Phase 3d: Extract ActionPlan only (removes most complex part)
3. Phase 3c: Extract LiveCameraFeed (isolates streaming complexity)

This alone would reduce main file from 3,448 lines to ~1,600 lines (53% reduction) and isolate the two most complex pieces.

---

## Long-Term Benefits

### Maintainability
- ✅ New developer can understand codebase faster
- ✅ Changes localized to specific files
- ✅ Easier to debug issues

### Performance
- ✅ React.memo() can optimize component re-renders
- ✅ Smaller components = faster compilation
- ✅ Code splitting becomes possible

### Quality
- ✅ Unit tests for hooks and components
- ✅ Storybook for component development
- ✅ Easier code reviews

### Scalability
- ✅ Can add features without bloating main file
- ✅ Components reusable in other views
- ✅ Team can work on different parts simultaneously

---

## Recommendation

**Start with Minimum Viable Refactoring** (Phase 1 + Phase 3d + Phase 3c)

This gives immediate benefits:
- 53% file size reduction
- Isolates most complex logic (ActionPlan, Video Streaming)
- Improves maintainability significantly
- Only 1 week of work
- Low risk

Then evaluate if full refactoring is worth the additional 2-3 weeks based on:
- How often this page needs changes
- Whether other developers will work on it
- If you plan to add more features

**Decision Point**: After Minimum Viable Refactoring, assess if further extraction provides enough value for the remaining time investment.
