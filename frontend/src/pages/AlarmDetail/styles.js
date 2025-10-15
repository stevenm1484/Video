// AlarmDetail Styles
// Extracted from AlarmDetail.jsx for better maintainability

export 
const styles = {
  container: {
    width: '100%',
    maxWidth: '1800px',
    margin: '0 auto',
    position: 'relative'
  },
  newEventNotification: {
    position: 'fixed',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '600px',
    maxWidth: '90vw',
    background: 'linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%)',
    border: '3px solid #ef4444',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 10px 40px rgba(239, 68, 68, 0.5), 0 0 0 1px rgba(239, 68, 68, 0.3)',
    zIndex: 9999,
    animation: 'slideDown 0.3s ease-out'
  },
  notificationHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
    position: 'relative'
  },
  notificationTitle: {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#fff',
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  notificationCloseBtn: {
    position: 'absolute',
    top: '-0.5rem',
    right: '-0.5rem',
    background: '#450a0a',
    border: '2px solid #ef4444',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    color: '#fff',
    transition: 'all 0.2s',
    padding: 0
  },
  notificationContent: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  notificationInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  notificationCamera: {
    fontSize: '1rem',
    color: '#fecaca'
  },
  notificationTime: {
    fontSize: '0.875rem',
    color: '#fca5a5'
  },
  notificationThumbnail: {
    width: '120px',
    height: '80px',
    objectFit: 'cover',
    borderRadius: '8px',
    border: '2px solid #ef4444',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
  },
  notificationFooter: {
    paddingTop: '0.75rem',
    borderTop: '1px solid rgba(239, 68, 68, 0.3)',
    textAlign: 'center'
  },
  notificationHint: {
    fontSize: '0.875rem',
    color: '#fca5a5',
    fontStyle: 'italic'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '1rem',
    color: '#94a3b8'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #334155',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  videoGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 150px 1fr',
    gap: '1.5rem',
    marginBottom: '2rem'
  },
  videoSection: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    overflow: 'visible'
  },
  videoHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #334155',
    background: '#0f172a'
  },
  videoTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0
  },
  timestamp: {
    fontSize: '0.875rem',
    color: '#94a3b8'
  },
  cameraSelect: {
    background: '#334155',
    border: '1px solid #475569',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    outline: 'none'
  },
  viewModeBtn: {
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    outline: 'none'
  },
  callPhoneBtn: {
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s'
  },
  cameraGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    padding: '1rem'
  },
  gridItem: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    overflow: 'hidden',
    border: '1px solid #334155'
  },
  gridItemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#0f172a',
    borderBottom: '1px solid #334155',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  alarmBadge: {
    background: '#ef4444',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#fff'
  },
  gridVideo: {
    width: '100%',
    height: 'auto',
    minHeight: '200px',
    maxHeight: '300px',
    objectFit: 'contain',
    display: 'block',
    background: '#000'
  },
  gridNoFeed: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    gap: '0.5rem',
    color: '#64748b',
    minHeight: '200px'
  },
  videoContainer: {
    position: 'relative',
    background: '#0f172a',
    minHeight: '300px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  video: {
    width: '100%',
    height: 'auto',
    maxHeight: '400px',
    objectFit: 'contain',
    display: 'block'
  },
  mediaThumbs: {
    display: 'flex',
    gap: '0.5rem',
    padding: '0.75rem',
    background: 'rgba(15, 23, 42, 0.95)',
    borderTop: '1px solid #334155',
    overflowX: 'auto'
  },
  thumb: {
    width: '80px',
    height: '60px',
    borderRadius: '0.375rem',
    overflow: 'hidden',
    cursor: 'pointer',
    border: '2px solid transparent',
    transition: 'border-color 0.2s',
    flexShrink: 0
  },
  thumbActive: {
    borderColor: '#3b82f6'
  },
  thumbImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  error: {
    textAlign: 'center',
    padding: '4rem',
    color: '#ef4444',
    fontSize: '1.25rem'
  },
  backBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#334155',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.625rem 1rem',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  holdBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#8b5cf6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.625rem 1rem',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600'
  },
  escalateBtnHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#f59e0b',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.625rem 1rem',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600'
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#ef4444',
    padding: '0.625rem 1rem',
    borderRadius: '0.5rem',
    color: '#fff',
    fontWeight: '600',
    fontSize: '0.95rem'
  },
  infoRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    marginBottom: '1.5rem'
  },
  accountSection: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    padding: '1rem',
    border: '1px solid #334155'
  },
  cameraSection: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    padding: '1rem',
    border: '1px solid #334155'
  },
  twoColumnLayout: {
    display: 'grid',
    gridTemplateColumns: '1.5fr 1fr',
    gap: '1.5rem',
    marginTop: '1.5rem'
  },
  rightPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  bottomRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 1fr',
    gap: '1.5rem',
    marginTop: '1.5rem'
  },
  bottomSection: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    padding: '1rem',
    border: '1px solid #334155'
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  noMedia: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    gap: '1rem',
    textAlign: 'center',
    color: '#64748b',
    minHeight: '300px'
  },
  toggleBtn: {
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 1rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  liveVideoContainer: {
    background: '#0f172a',
    borderRadius: '0.5rem',
    padding: '1rem'
  },
  rtspInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#94a3b8',
    fontSize: '0.85rem',
    marginBottom: '1rem',
    padding: '0.75rem',
    background: '#1e293b',
    borderRadius: '0.375rem'
  },
  liveVideoNote: {
    color: '#94a3b8',
    fontSize: '0.85rem',
    fontStyle: 'italic',
    padding: '0.75rem',
    background: '#1e293b',
    borderRadius: '0.375rem'
  },
  notesInput: {
    width: '100%',
    minHeight: '120px',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    resize: 'vertical',
    fontFamily: 'inherit',
    outline: 'none'
  },
  infoCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  accountInfoCompact: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  compactRow: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    padding: '0.625rem 0.75rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    borderBottom: '1px solid #1e293b'
  },
  compactField: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flex: '1'
  },
  compactFieldFull: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flex: '1'
  },
  compactLabel: {
    color: '#94a3b8',
    fontSize: '0.85rem',
    fontWeight: '500',
    whiteSpace: 'nowrap'
  },
  compactValue: {
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  addressInline: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    lineHeight: '1.4'
  },
  contactsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  contactsListScrollable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '200px',
    overflowY: 'auto',
    overflowX: 'visible',
    paddingRight: '0.5rem'
  },
  compactContactCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.625rem 0.75rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #334155',
    minHeight: '36px',
    position: 'relative',
    overflow: 'visible'
  },
  compactContactInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: 1,
    minWidth: 0
  },
  compactContactName: {
    fontWeight: '600',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: '80px'
  },
  compactContactPhone: {
    color: '#94a3b8',
    fontSize: '0.875rem',
    whiteSpace: 'nowrap'
  },
  compactCallBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#fff',
    cursor: 'pointer',
    flexShrink: 0
  },
  compactHangupBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#ef4444',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem',
    color: '#fff',
    cursor: 'pointer',
    flexShrink: 0
  },
  contactCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  contactName: {
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.25rem'
  },
  contactPhone: {
    color: '#94a3b8',
    fontSize: '0.9rem'
  },
  callBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.375rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 1rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    textDecoration: 'none',
    cursor: 'pointer'
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  escalateBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    background: '#f59e0b',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '1rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '0.5rem'
  },
  resolveBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '1rem',
    color: '#fff',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '0.5rem'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  fieldLabel: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#cbd5e1'
  },
  resolutionSelect: {
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.75rem',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    outline: 'none',
    cursor: 'pointer'
  },
  historyNotesContainer: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    minHeight: '300px'
  },
  historySection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  historySubtitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  historyNotes: {
    background: '#0f172a',
    borderRadius: '0.5rem',
    padding: '1rem',
    color: '#cbd5e1',
    fontSize: '0.9rem',
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap'
  },
  callLogsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  callLogCard: {
    background: '#0f172a',
    borderRadius: '0.5rem',
    padding: '1rem',
    border: '1px solid #334155'
  },
  callLogHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '0.5rem'
  },
  callLogContact: {
    fontWeight: '600',
    color: '#e2e8f0',
    fontSize: '0.95rem'
  },
  callLogPhone: {
    color: '#94a3b8',
    fontSize: '0.85rem',
    marginTop: '0.25rem'
  },
  callLogResolution: {
    display: 'inline-block',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: '600',
    background: '#78350f',
    color: '#fbbf24'
  },
  callLogNotes: {
    color: '#cbd5e1',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
    fontStyle: 'italic'
  },
  callLogTime: {
    color: '#64748b',
    fontSize: '0.75rem',
    marginTop: '0.5rem'
  },
  eventsTimeline: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1rem',
    marginBottom: '1.5rem'
  },
  timelineHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid #334155'
  },
  timelineTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: '#e2e8f0',
    margin: 0
  },
  loadMoreBtn: {
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 1rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  timelineScroll: {
    display: 'flex',
    gap: '1rem',
    overflowX: 'auto',
    paddingBottom: '0.5rem'
  },
  timelineEvent: {
    minWidth: '180px',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '2px solid #334155',
    padding: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  timelineEventActive: {
    border: '2px solid #3b82f6',
    background: '#1e293b'
  },
  timelineEventCurrent: {
    border: '2px solid #f59e0b'
  },
  timelineEventHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '0.5rem'
  },
  timelineEventCamera: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  currentAlarmBadge: {
    background: '#f59e0b',
    color: '#fff',
    fontSize: '0.65rem',
    fontWeight: '700',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    whiteSpace: 'nowrap'
  },
  timelineEventTime: {
    fontSize: '0.75rem',
    color: '#94a3b8'
  },
  timelineEventMedia: {
    fontSize: '0.7rem',
    color: '#64748b',
    fontWeight: '500'
  },
  timelineEventThumb: {
    width: '100%',
    height: '100px',
    objectFit: 'cover',
    borderRadius: '0.375rem',
    marginTop: '0.25rem'
  },
  // Vertical Timeline Styles (for event list beside video)
  eventsTimelineVertical: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    height: '100%'
  },
  timelineHeaderVertical: {
    padding: '1rem',
    borderBottom: '1px solid #334155'
  },
  timelineScrollVertical: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    overflowY: 'auto',
    flex: 1,
    maxHeight: 'calc(100vh - 400px)'
  },
  timelineEventVertical: {
    display: 'flex',
    flexDirection: 'column',
    padding: '0.5rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.2s',
    position: 'relative'
  },
  timelineEventVerticalActive: {
    borderColor: '#3b82f6',
    background: '#1e3a5f'
  },
  timelineEventContentVertical: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    position: 'relative'
  },
  timelineEventThumbVertical: {
    width: '100%',
    height: '80px',
    objectFit: 'cover',
    borderRadius: '0.375rem'
  },
  timelineEventInfoVertical: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  timelineEventCameraSmall: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: '#e2e8f0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  timelineEventTimeSmall: {
    fontSize: '0.65rem',
    color: '#94a3b8',
    lineHeight: '1.2'
  },
  currentAlarmBadgeSmall: {
    position: 'absolute',
    top: '0.25rem',
    right: '0.25rem',
    background: '#065f46',
    color: '#10b981',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
    fontSize: '0.625rem',
    fontWeight: '700',
    zIndex: 1
  },
  timelineEventDetailsVertical: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    flex: 1,
    minWidth: 0
  },
  timelineEventHeaderVertical: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  // Action Plan Styles
  actionPlanContainer: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    padding: '1.5rem',
    marginBottom: '1.5rem'
  },
  actionPlanTitle: {
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: '1rem',
    margin: 0,
    paddingBottom: '1rem',
    borderBottom: '2px solid #334155'
  },
  actionPlanContent: {
    display: 'grid',
    gridTemplateColumns: '1fr 300px',
    gap: '2rem'
  },
  noActionPlan: {
    background: '#1e293b',
    borderRadius: '0.5rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionPlanChecklist: {
    flex: 1
  },
  actionPlanSubtitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#cbd5e1',
    marginBottom: '1rem'
  },
  actionPlanSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  actionPlanStep: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
    padding: '1rem',
    background: '#0f172a',
    borderRadius: '0.5rem',
    border: '1px solid #334155'
  },
  stepNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    background: '#334155',
    borderRadius: '50%',
    color: '#e2e8f0',
    fontSize: '0.875rem',
    fontWeight: '600',
    flexShrink: 0
  },
  stepContent: {
    flex: 1
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    cursor: 'pointer',
    color: '#e2e8f0',
    fontSize: '0.95rem'
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
    accentColor: '#10b981'
  },
  stepTextCompleted: {
    textDecoration: 'line-through',
    color: '#64748b'
  },
  toolStep: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem'
  },
  toolInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    flex: 1
  },
  toolIcon: {
    fontSize: '1.25rem'
  },
  toolButton: {
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.5rem 1rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  completedBadge: {
    background: '#065f46',
    color: '#10b981',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: '600'
  },
  quickTools: {
    background: '#0f172a',
    borderRadius: '0.5rem',
    padding: '1rem',
    border: '1px solid #334155',
    height: 'fit-content'
  },
  quickToolsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  quickToolBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    padding: '0.875rem 1rem',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'left'
  },
  // Grid Modal Styles
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  gridModal: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    border: '1px solid #334155',
    width: '95vw',
    maxWidth: '1600px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column'
  },
  gridModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #334155'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: '700',
    color: '#e2e8f0',
    margin: 0
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  gridModalContent: {
    flex: 1,
    overflow: 'auto',
    padding: '1.5rem'
  },
  gridCameraName: {
    fontWeight: '600',
    color: '#e2e8f0'
  },
  gridCameraLocation: {
    fontSize: '0.75rem',
    color: '#94a3b8'
  },
  gridModalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '1.5rem',
    borderTop: '1px solid #334155',
    gap: '1rem'
  },
  cancelBtn: {
    background: '#334155',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  // Boolean Step Styles
  booleanStep: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  booleanQuestion: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: '0.25rem'
  },
  booleanButtons: {
    display: 'flex',
    gap: '0.75rem'
  },
  booleanBtn: {
    flex: 1,
    padding: '0.875rem 1.5rem',
    border: '2px solid #334155',
    borderRadius: '0.5rem',
    background: '#0f172a',
    color: '#94a3b8',
    fontSize: '1rem',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  booleanBtnYesActive: {
    background: '#065f46',
    borderColor: '#10b981',
    color: '#10b981',
    boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.1)'
  },
  booleanBtnNoActive: {
    background: '#7c2d12',
    borderColor: '#f97316',
    color: '#f97316',
    boxShadow: '0 0 0 3px rgba(249, 115, 22, 0.1)'
  },
  branchSteps: {
    marginTop: '0.5rem',
    paddingLeft: '1.5rem',
    borderLeft: '3px solid #334155',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  branchLabel: {
    fontSize: '0.875rem',
    fontWeight: '700',
    color: '#3b82f6',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.25rem'
  },
  branchStepItem: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
    padding: '0.75rem',
    background: '#0f172a',
    borderRadius: '0.375rem',
    border: '1px solid #1e293b'
  },
  branchStepNumber: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    height: '24px',
    background: '#1e293b',
    borderRadius: '0.25rem',
    color: '#64748b',
    fontSize: '0.75rem',
    fontWeight: '600',
    flexShrink: 0
  },
  branchStepContent: {
    flex: 1
  },
  // Escalate Modal Styles
  escalateModal: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    width: '100%',
    maxWidth: '500px',
    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
    border: '1px solid #334155'
  },
  escalateModalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #334155'
  },
  escalateModalTitle: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#e2e8f0'
  },
  escalateModalCloseBtn: {
    background: 'transparent',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer',
    padding: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '0.375rem',
    transition: 'all 0.2s'
  },
  escalateModalBody: {
    padding: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  escalateModalLabel: {
    color: '#e2e8f0',
    fontSize: '0.95rem',
    fontWeight: '600',
    marginBottom: '0.5rem'
  },
  escalateModalTextarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    fontFamily: 'inherit',
    resize: 'vertical',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  escalateModalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '1.5rem',
    borderTop: '1px solid #334155'
  },
  escalateModalCancelBtn: {
    background: '#334155',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  escalateModalConfirmBtn: {
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: 'white',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s'
  },
  holdModalConfirmBtn: {
    background: '#8b5cf6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: 'white',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s'
  },
  // Action Buttons at Bottom
  actionsContainer: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap'
  },
  actionButton: {
    flex: 1,
    minWidth: '150px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    background: '#f59e0b',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.875rem 1.25rem',
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  holdButton: {
    flex: 1,
    minWidth: '150px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    background: '#8b5cf6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.875rem 1.25rem',
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  resolveButton: {
    flex: 1,
    minWidth: '150px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    background: '#10b981',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.875rem 1.25rem',
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  // Tab Styles
  tabbedLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    marginTop: '1.5rem'
  },
  tabbedLeftPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    minHeight: '500px'
  },
  tabsNavigation: {
    display: 'flex',
    gap: '0.5rem',
    borderBottom: '2px solid #334155',
    background: '#1e293b',
    borderRadius: '0.5rem 0.5rem 0 0',
    padding: '0.5rem 0.5rem 0 0.5rem'
  },
  tabButton: {
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    padding: '0.75rem 1.25rem',
    color: '#94a3b8',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    borderRadius: '0.375rem 0.375rem 0 0',
    marginBottom: '-2px'
  },
  tabButtonActive: {
    background: '#0f172a',
    color: '#3b82f6',
    borderBottom: '2px solid #3b82f6'
  },
  tabContent: {
    background: '#1e293b',
    borderRadius: '0 0.5rem 0.5rem 0.5rem',
    border: '1px solid #334155',
    borderTop: 'none',
    minHeight: '400px',
    flex: 1
  },
  // Active Call Badge Styles
  activeCallBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#10b981',
    padding: '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    color: '#fff',
    fontSize: '0.875rem',
    fontWeight: '600'
  },
  activeCallText: {
    whiteSpace: 'nowrap'
  },
  activeCallMaximizeBtn: {
    background: '#059669',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.25rem 0.5rem',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: '600',
    transition: 'all 0.2s'
  },
  activeCallHangupBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#dc2626',
    border: 'none',
    borderRadius: '0.375rem',
    padding: '0.375rem',
    color: '#fff',
    cursor: 'pointer',
    transition: 'all 0.2s'
  }
}
