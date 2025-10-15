import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { Search, Eye, Plus } from 'lucide-react'
import api from '../api/axios'

export default function AccountsLookup() {
  const navigate = useNavigate()
  const [accounts, setAccounts] = useState([])
  const [filteredAccounts, setFilteredAccounts] = useState([])
  const [groups, setGroups] = useState([])
  const [dealers, setDealers] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [filterDealer, setFilterDealer] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    applyFilters()
  }, [searchTerm, filterGroup, filterDealer, accounts])

  const loadData = async () => {
    try {
      const [accountsRes, groupsRes, dealersRes] = await Promise.all([
        api.get('/accounts'),
        api.get('/groups'),
        api.get('/dealers')
      ])

      setAccounts(accountsRes.data)
      setGroups(groupsRes.data)
      setDealers(dealersRes.data)
    } catch (error) {
      toast.error('Failed to load accounts')
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...accounts]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(account =>
        (account.name && account.name.toLowerCase().includes(term)) ||
        (account.account_number && account.account_number.toLowerCase().includes(term)) ||
        (account.address && account.address.toLowerCase().includes(term)) ||
        (account.city && account.city.toLowerCase().includes(term))
      )
    }

    // Group filter
    if (filterGroup) {
      filtered = filtered.filter(account => {
        if (account.group_id === parseInt(filterGroup)) return true
        const group = groups.find(g => g.id === parseInt(filterGroup))
        return group && account.group === group.name
      })
    }

    // Dealer filter
    if (filterDealer) {
      filtered = filtered.filter(account => {
        if (account.dealer_id === parseInt(filterDealer)) return true
        const dealer = dealers.find(d => d.id === parseInt(filterDealer))
        return dealer && account.dealer === dealer.name
      })
    }

    setFilteredAccounts(filtered)
  }

  const getGroupName = (account) => {
    if (account.group_id) {
      const group = groups.find(g => g.id === account.group_id)
      return group?.name || '-'
    }
    return account.group || '-'
  }

  const getDealerName = (account) => {
    if (account.dealer_id) {
      const dealer = dealers.find(d => d.id === account.dealer_id)
      return dealer?.name || '-'
    }
    return account.dealer || '-'
  }

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <div style={{color: '#94a3b8'}}>Loading accounts...</div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Account Lookup</h1>
          <p style={styles.subtitle}>Search and manage video monitoring accounts</p>
        </div>
        <button
          onClick={() => navigate('/accounts/new')}
          style={styles.addBtn}
        >
          <Plus size={20} />
          <span>New Account</span>
        </button>
      </div>

      {/* Search and Filter Controls */}
      <div style={styles.filterCard}>
        <div style={styles.filterGrid}>
          {/* Search */}
          <div style={styles.inputWrapper}>
            <Search style={styles.searchIcon} size={20} />
            <input
              type="text"
              placeholder="Search name, account #, address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.searchInput}
            />
          </div>

          {/* Group Filter */}
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            style={styles.select}
          >
            <option value="">All Groups</option>
            {groups.map(group => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>

          {/* Dealer Filter */}
          <select
            value={filterDealer}
            onChange={(e) => setFilterDealer(e.target.value)}
            style={styles.select}
          >
            <option value="">All Dealers</option>
            {dealers.map(dealer => (
              <option key={dealer.id} value={dealer.id}>
                {dealer.name}
              </option>
            ))}
          </select>
        </div>

        <div style={styles.resultCount}>
          Showing {filteredAccounts.length} of {accounts.length} accounts
        </div>
      </div>

      {/* Results Table */}
      <div style={styles.tableCard}>
        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead style={styles.thead}>
              <tr>
                <th style={styles.th}>Group</th>
                <th style={styles.th}>Dealer</th>
                <th style={styles.th}>Account Number</th>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Address</th>
                <th style={{...styles.th, textAlign: 'right'}}>Actions</th>
              </tr>
            </thead>
            <tbody style={styles.tbody}>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan="6" style={styles.emptyCell}>
                    No accounts found
                  </td>
                </tr>
              ) : (
                filteredAccounts.map(account => (
                  <tr
                    key={account.id}
                    style={styles.tr}
                    onClick={() => navigate(`/accounts/${account.id}`)}
                  >
                    <td style={styles.td}>{getGroupName(account)}</td>
                    <td style={styles.td}>{getDealerName(account)}</td>
                    <td style={{...styles.td, fontWeight: '600', color: '#e2e8f0'}}>
                      {account.account_number || '-'}
                    </td>
                    <td style={{...styles.td, color: '#e2e8f0'}}>
                      {account.name}
                    </td>
                    <td style={styles.td}>
                      {account.address ? (
                        <div>
                          <div>{account.address}</div>
                          {(account.city || account.state || account.zip_code) && (
                            <div style={styles.addressSubtext}>
                              {[account.city, account.state, account.zip_code].filter(Boolean).join(', ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td style={{...styles.td, textAlign: 'right'}}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/accounts/${account.id}`)
                        }}
                        style={styles.viewBtn}
                      >
                        <Eye size={16} style={{marginRight: '4px'}} />
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    padding: '1.5rem',
    width: '100%'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '1rem'
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #334155',
    borderTop: '4px solid #3b82f6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem'
  },
  title: {
    fontSize: '1.875rem',
    fontWeight: '700',
    color: '#e2e8f0',
    marginBottom: '0.5rem'
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '0.875rem'
  },
  addBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#3b82f6',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.75rem 1.5rem',
    color: '#fff',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  filterCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    padding: '1rem',
    marginBottom: '1.5rem',
    border: '1px solid #334155'
  },
  filterGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginBottom: '0.75rem'
  },
  inputWrapper: {
    position: 'relative',
    width: '100%'
  },
  searchIcon: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#94a3b8',
    pointerEvents: 'none'
  },
  searchInput: {
    width: '100%',
    paddingLeft: '2.5rem',
    paddingRight: '1rem',
    paddingTop: '0.5rem',
    paddingBottom: '0.5rem',
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    outline: 'none'
  },
  select: {
    width: '100%',
    padding: '0.5rem 1rem',
    background: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    outline: 'none',
    cursor: 'pointer'
  },
  resultCount: {
    fontSize: '0.875rem',
    color: '#94a3b8'
  },
  tableCard: {
    background: '#1e293b',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    border: '1px solid #334155'
  },
  tableWrapper: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  thead: {
    background: '#0f172a'
  },
  th: {
    padding: '0.75rem 1.5rem',
    textAlign: 'left',
    fontSize: '0.75rem',
    fontWeight: '500',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  tbody: {
    background: '#1e293b'
  },
  tr: {
    borderTop: '1px solid #334155',
    cursor: 'pointer',
    transition: 'background 0.2s'
  },
  td: {
    padding: '1rem 1.5rem',
    fontSize: '0.875rem',
    color: '#cbd5e1',
    whiteSpace: 'nowrap'
  },
  emptyCell: {
    padding: '2rem 1.5rem',
    textAlign: 'center',
    color: '#94a3b8'
  },
  addressSubtext: {
    fontSize: '0.75rem',
    color: '#94a3b8',
    marginTop: '0.25rem'
  },
  viewBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0.375rem 0.75rem',
    background: '#3b82f6',
    color: '#fff',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'background 0.2s'
  }
}
