import React from 'react'

export default function VitalSignsSettings({ formData, setFormData, styles, idPrefix = '' }) {
  return (
    <div style={{ ...styles.formGroup, marginTop: '1.5rem', padding: '1rem', backgroundColor: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155' }}>
      <h3 style={{ ...styles.label, fontSize: '1rem', marginBottom: '1rem', color: '#60a5fa' }}>
        Vital Signs Monitoring
      </h3>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="checkbox"
          id={`${idPrefix}connectivity_enabled`}
          checked={formData.vital_signs_connectivity_enabled || false}
          onChange={e => setFormData({ ...formData, vital_signs_connectivity_enabled: e.target.checked })}
          style={{ marginRight: '0.5rem', width: '18px', height: '18px', cursor: 'pointer' }}
        />
        <label htmlFor={`${idPrefix}connectivity_enabled`} style={{ ...styles.label, margin: 0, cursor: 'pointer' }}>
          Enable RTSP Connectivity Monitoring
        </label>
      </div>
      <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '1rem', display: 'block', marginLeft: '1.75rem' }}>
        Check camera RTSP connection every hour and alert if offline
      </small>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <input
          type="checkbox"
          id={`${idPrefix}image_change_enabled`}
          checked={formData.vital_signs_image_change_enabled || false}
          onChange={e => setFormData({ ...formData, vital_signs_image_change_enabled: e.target.checked })}
          style={{ marginRight: '0.5rem', width: '18px', height: '18px', cursor: 'pointer' }}
        />
        <label htmlFor={`${idPrefix}image_change_enabled`} style={{ ...styles.label, margin: 0, cursor: 'pointer' }}>
          Enable Image Change Detection
        </label>
      </div>
      <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '1rem', display: 'block', marginLeft: '1.75rem' }}>
        Detect if camera was moved or blocked (checked every 12 hours)
      </small>

      <div style={{ marginLeft: '1.75rem' }}>
        <label style={styles.label}>Image Change Threshold (%)</label>
        <input
          type="number"
          style={{ ...styles.input, maxWidth: '150px' }}
          value={formData.vital_signs_image_change_threshold || 50}
          onChange={e => setFormData({ ...formData, vital_signs_image_change_threshold: parseInt(e.target.value) || 50 })}
          min="1"
          max="100"
          disabled={!formData.vital_signs_image_change_enabled}
        />
        <small style={{ color: '#94a3b8', fontSize: '0.75rem', marginTop: '0.25rem', display: 'block' }}>
          Percentage of image difference to trigger alert (default: 50%)
        </small>
      </div>
    </div>
  )
}
