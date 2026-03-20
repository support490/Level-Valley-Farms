import { useState, useEffect } from 'react'
import {
  Plus, Package, Truck, Pill, ShoppingCart, ClipboardList, Edit2,
  ToggleLeft, ToggleRight, XCircle, Phone, Mail, MapPin, Wheat,
} from 'lucide-react'
import {
  getVendors, createVendor, updateVendor,
  getFeedDeliveries, createFeedDelivery, getFeedInventory, getFeedConversion,
  getMedications, createMedication, updateMedication, administerMedication, getMedicationAdmins,
  getPurchaseOrders, createPurchaseOrder, updatePOStatus,
} from '../api/feed'
import { createBillFromFeedDelivery } from '../api/accounting'
import { getFlocks } from '../api/flocks'
import { getBarns } from '../api/barns'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

export default function Feed() {
  const [tab, setTab] = useState('inventory')
  const [vendors, setVendors] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [feedInv, setFeedInv] = useState([])
  const [conversion, setConversion] = useState([])
  const [medications, setMedications] = useState([])
  const [admins, setAdmins] = useState([])
  const [pos, setPos] = useState([])
  const [flocks, setFlocks] = useState([])
  const [barns, setBarns] = useState([])

  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [vendorOpen, setVendorOpen] = useState(false)
  const [editVendorOpen, setEditVendorOpen] = useState(false)
  const [editVendorTarget, setEditVendorTarget] = useState(null)
  const [medOpen, setMedOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [poOpen, setPoOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  const [deliveryForm, setDeliveryForm] = useState({
    ticket_number: '', barn_id: '', flock_id: '', vendor_id: '',
    delivery_date: new Date().toISOString().split('T')[0],
    feed_type: 'layer', tons: '', cost_per_ton: '', notes: '',
  })
  const [vendorForm, setVendorForm] = useState({
    name: '', vendor_type: 'feed', contact_name: '', phone: '', email: '', address: '', notes: '',
  })
  const [medForm, setMedForm] = useState({
    name: '', unit: 'dose', quantity_on_hand: '', reorder_level: '', cost_per_unit: '', vendor_id: '', notes: '',
  })
  const [adminForm, setAdminForm] = useState({
    flock_id: '', medication_id: '', admin_date: new Date().toISOString().split('T')[0],
    dosage: '', administered_by: '', notes: '',
  })
  const [poForm, setPoForm] = useState({
    vendor_id: '', order_date: new Date().toISOString().split('T')[0],
    expected_date: '', notes: '',
    lines: [{ description: '', quantity: '', unit: 'tons', unit_price: '' }],
  })

  const load = async () => {
    try {
      const [vendorsRes, deliveriesRes, invRes, convRes, medsRes, adminsRes, posRes, flocksRes, barnsRes] = await Promise.all([
        getVendors(), getFeedDeliveries(), getFeedInventory(), getFeedConversion(),
        getMedications(), getMedicationAdmins(), getPurchaseOrders(),
        getFlocks({ status: 'active' }), getBarns(),
      ])
      setVendors(vendorsRes.data || [])
      setDeliveries(deliveriesRes.data || [])
      setFeedInv(invRes.data || [])
      setConversion(convRes.data || [])
      setMedications(medsRes.data || [])
      setAdmins(adminsRes.data || [])
      setPos(posRes.data || [])
      setFlocks(flocksRes.data || [])
      setBarns(barnsRes.data || [])
    } catch { showToast('Error loading data', 'error') }
  }

  useEffect(() => { load() }, [])

  const barnOptions = barns.map(b => ({ value: b.id, label: b.name }))
  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))
  const vendorOptions = vendors.filter(v => v.is_active).map(v => ({ value: v.id, label: v.name }))
  const medOptions = medications.filter(m => m.is_active).map(m => ({ value: m.id, label: `${m.name} (${m.quantity_on_hand} ${m.unit})` }))
  const feedTypes = ['layer', 'pullet', 'starter', 'grower', 'pre_lay', 'other'].map(t => ({ value: t, label: t.replace('_', '-').toUpperCase() }))
  const vendorTypes = ['feed', 'medication', 'supplies', 'equipment', 'other'].map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))

  // ── Handlers ──
  const handleCreateDelivery = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!deliveryForm.barn_id || !deliveryForm.tons) { showToast('Barn and tons are required', 'error'); return }
    setSubmitting(true)
    try {
      await createFeedDelivery({
        ...deliveryForm, tons: parseFloat(deliveryForm.tons),
        cost_per_ton: deliveryForm.cost_per_ton ? parseFloat(deliveryForm.cost_per_ton) : null,
        flock_id: deliveryForm.flock_id || null, vendor_id: deliveryForm.vendor_id || null,
      })
      showToast('Feed delivery recorded')
      setDeliveryOpen(false)
      setDeliveryForm({ ticket_number: '', barn_id: '', flock_id: '', vendor_id: '', delivery_date: new Date().toISOString().split('T')[0], feed_type: 'layer', tons: '', cost_per_ton: '', notes: '' })
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handleCreateVendor = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!vendorForm.name.trim()) { showToast('Vendor name required', 'error'); return }
    setSubmitting(true)
    try {
      await createVendor(vendorForm)
      showToast('Vendor created')
      setVendorOpen(false)
      setVendorForm({ name: '', vendor_type: 'feed', contact_name: '', phone: '', email: '', address: '', notes: '' })
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const openEditVendor = (v) => {
    setEditVendorTarget(v)
    setVendorForm({ name: v.name, vendor_type: v.vendor_type, contact_name: v.contact_name || '', phone: v.phone || '', email: v.email || '', address: v.address || '', notes: v.notes || '' })
    setEditVendorOpen(true)
  }

  const handleUpdateVendor = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await updateVendor(editVendorTarget.id, vendorForm)
      showToast('Vendor updated')
      setEditVendorOpen(false); setEditVendorTarget(null); load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handleToggleVendor = async (v) => {
    try { await updateVendor(v.id, { is_active: !v.is_active }); showToast(v.is_active ? 'Vendor deactivated' : 'Vendor activated'); load() }
    catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  const handleCreateMed = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!medForm.name.trim()) { showToast('Name required', 'error'); return }
    setSubmitting(true)
    try {
      await createMedication({
        ...medForm,
        quantity_on_hand: parseFloat(medForm.quantity_on_hand) || 0,
        reorder_level: medForm.reorder_level ? parseFloat(medForm.reorder_level) : null,
        cost_per_unit: medForm.cost_per_unit ? parseFloat(medForm.cost_per_unit) : null,
        vendor_id: medForm.vendor_id || null,
      })
      showToast('Medication added')
      setMedOpen(false)
      setMedForm({ name: '', unit: 'dose', quantity_on_hand: '', reorder_level: '', cost_per_unit: '', vendor_id: '', notes: '' })
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handleAdminMed = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!adminForm.flock_id || !adminForm.medication_id || !adminForm.dosage) { showToast('Flock, medication, and dosage required', 'error'); return }
    setSubmitting(true)
    try {
      await administerMedication({ ...adminForm, dosage: parseFloat(adminForm.dosage) })
      showToast('Medication administered')
      setAdminOpen(false)
      setAdminForm({ flock_id: '', medication_id: '', admin_date: new Date().toISOString().split('T')[0], dosage: '', administered_by: '', notes: '' })
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const addPOLine = () => setPoForm(prev => ({ ...prev, lines: [...prev.lines, { description: '', quantity: '', unit: 'each', unit_price: '' }] }))
  const updatePOLine = (idx, field, value) => setPoForm(prev => ({ ...prev, lines: prev.lines.map((l, i) => i === idx ? { ...l, [field]: value } : l) }))
  const removePOLine = (idx) => { if (poForm.lines.length <= 1) return; setPoForm(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) })) }

  const handleCreatePO = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!poForm.vendor_id) { showToast('Vendor required', 'error'); return }
    const validLines = poForm.lines.filter(l => l.description.trim() && parseFloat(l.quantity) > 0)
    if (validLines.length === 0) { showToast('Add at least one line item', 'error'); return }
    setSubmitting(true)
    try {
      await createPurchaseOrder({
        vendor_id: poForm.vendor_id, order_date: poForm.order_date,
        expected_date: poForm.expected_date || null, notes: poForm.notes || null,
        lines: validLines.map(l => ({
          description: l.description, quantity: parseFloat(l.quantity), unit: l.unit,
          unit_price: l.unit_price ? parseFloat(l.unit_price) : null,
        })),
      })
      showToast('Purchase order created')
      setPoOpen(false)
      setPoForm({ vendor_id: '', order_date: new Date().toISOString().split('T')[0], expected_date: '', notes: '', lines: [{ description: '', quantity: '', unit: 'tons', unit_price: '' }] })
      load()
    } catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
    finally { setSubmitting(false) }
  }

  const handlePOStatus = async (poId, status) => {
    try { await updatePOStatus(poId, status); showToast(`PO marked as ${status}`); load() }
    catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  const statusColors = {
    draft: 'bg-lvf-muted/20 text-lvf-muted', submitted: 'bg-lvf-accent/20 text-lvf-accent',
    approved: 'bg-lvf-success/20 text-lvf-success', received: 'bg-lvf-success/20 text-lvf-success',
    cancelled: 'bg-lvf-danger/20 text-lvf-danger',
  }

  const tabs = [
    { id: 'inventory', label: 'Feed Inventory', icon: Wheat },
    { id: 'tickets', label: 'Feed Tickets', icon: ClipboardList },
    { id: 'conversion', label: 'Feed Conversion', icon: Truck },
    { id: 'medications', label: 'Medications', icon: Pill },
    { id: 'vendors', label: 'Vendors', icon: Package },
    { id: 'pos', label: 'Purchase Orders', icon: ShoppingCart },
  ]

  const totalFeedTons = feedInv.reduce((s, i) => s + i.total_tons_delivered, 0)
  const totalFeedCost = feedInv.reduce((s, i) => s + i.total_cost, 0)

  return (
    <div>
      {toast && <Toast {...toast} onClose={hideToast} />}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Feed & Inputs</h2>
        <div className="flex gap-2">
          {tab === 'tickets' && <button onClick={() => setDeliveryOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={16} /> Record Delivery</button>}
          {tab === 'medications' && (
            <>
              <button onClick={() => setAdminOpen(true)} className="glass-button-secondary flex items-center gap-2"><Pill size={14} /> Administer</button>
              <button onClick={() => setMedOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={16} /> Add Medication</button>
            </>
          )}
          {tab === 'vendors' && <button onClick={() => setVendorOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={16} /> Add Vendor</button>}
          {tab === 'pos' && <button onClick={() => setPoOpen(true)} className="glass-button-primary flex items-center gap-2"><Plus size={16} /> Create PO</button>}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="glass-card stat-glow p-4">
          <div className="flex items-center gap-2 mb-1"><Wheat size={14} className="text-lvf-accent" /><p className="text-xs text-lvf-muted">Feed Delivered</p></div>
          <p className="text-2xl font-bold text-lvf-accent">{totalFeedTons.toFixed(1)} tons</p>
        </div>
        <div className="glass-card stat-glow p-4">
          <div className="flex items-center gap-2 mb-1"><Package size={14} className="text-lvf-success" /><p className="text-xs text-lvf-muted">Feed Cost</p></div>
          <p className="text-2xl font-bold text-lvf-success">${totalFeedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card stat-glow p-4">
          <div className="flex items-center gap-2 mb-1"><Pill size={14} className="text-lvf-accent2" /><p className="text-xs text-lvf-muted">Medications</p></div>
          <p className="text-2xl font-bold">{medications.length}</p>
        </div>
        <div className="glass-card stat-glow p-4">
          <div className="flex items-center gap-2 mb-1"><ShoppingCart size={14} className="text-lvf-warning" /><p className="text-xs text-lvf-muted">Open POs</p></div>
          <p className="text-2xl font-bold">{pos.filter(p => !['received', 'cancelled'].includes(p.status)).length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 glass-card w-fit flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
            }`}><t.icon size={14} /> {t.label}</button>
        ))}
      </div>

      {/* ═══════════ FEED INVENTORY ═══════════ */}
      {tab === 'inventory' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead><tr><th>Barn</th><th>Feed Type</th><th className="text-right">Total Tons</th><th className="text-right">Total Cost</th><th className="text-right">Deliveries</th><th>Last Delivery</th></tr></thead>
            <tbody>
              {feedInv.map((f, i) => (
                <tr key={i}>
                  <td className="font-medium">{f.barn_name}</td>
                  <td><span className="px-2 py-0.5 rounded-full text-xs bg-lvf-accent/10 text-lvf-accent">{f.feed_type.replace('_', '-').toUpperCase()}</span></td>
                  <td className="text-right font-mono font-medium">{f.total_tons_delivered.toFixed(1)}</td>
                  <td className="text-right font-mono">${f.total_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="text-right">{f.num_deliveries}</td>
                  <td className="text-lvf-muted">{f.last_delivery}</td>
                </tr>
              ))}
              {feedInv.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-lvf-muted">No feed deliveries recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ FEED TICKETS ═══════════ */}
      {tab === 'tickets' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead><tr><th>Ticket #</th><th>Date</th><th>Barn</th><th>Flock</th><th>Vendor</th><th>Type</th><th className="text-right">Tons</th><th className="text-right">$/Ton</th><th className="text-right">Total</th><th></th></tr></thead>
            <tbody>
              {deliveries.map(d => (
                <tr key={d.id}>
                  <td className="font-semibold text-lvf-accent font-mono">{d.ticket_number}</td>
                  <td className="text-lvf-muted">{d.delivery_date}</td>
                  <td>{d.barn_name}</td>
                  <td className="text-lvf-accent text-xs">{d.flock_number || '—'}</td>
                  <td className="text-xs">{d.vendor_name || '—'}</td>
                  <td><span className="px-2 py-0.5 rounded-full text-xs bg-lvf-accent/10 text-lvf-accent">{d.feed_type.replace('_', '-').toUpperCase()}</span></td>
                  <td className="text-right font-mono font-medium">{d.tons.toFixed(1)}</td>
                  <td className="text-right font-mono">{d.cost_per_ton ? `$${d.cost_per_ton.toFixed(2)}` : '—'}</td>
                  <td className="text-right font-mono font-medium text-lvf-success">{d.total_cost ? `$${d.total_cost.toFixed(2)}` : '—'}</td>
                  <td>
                    {d.total_cost > 0 && !d.bill_id && (
                      <button className="glass-button-primary text-xs" style={{ padding: '2px 8px', fontSize: '7pt' }}
                        onClick={async () => {
                          try {
                            await createBillFromFeedDelivery(d.id)
                            showToast(`Bill created for ticket ${d.ticket_number}`)
                            load()
                          } catch (err) { showToast(err.response?.data?.detail || 'Error creating bill', 'error') }
                        }}>
                        Create Bill
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {deliveries.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-lvf-muted">No feed tickets yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ FEED CONVERSION ═══════════ */}
      {tab === 'conversion' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead><tr><th>Flock</th><th className="text-right">Feed (tons)</th><th className="text-right">Feed (lbs)</th><th className="text-right">Eggs</th><th className="text-right">Dozens</th><th className="text-right">Lbs/Dozen</th><th className="text-right">Feed Cost/Doz</th></tr></thead>
            <tbody>
              {conversion.map(c => (
                <tr key={c.flock_id}>
                  <td className="font-semibold text-lvf-accent">{c.flock_number}</td>
                  <td className="text-right font-mono">{c.total_feed_tons.toFixed(3)}</td>
                  <td className="text-right font-mono text-lvf-muted">{c.total_feed_lbs.toLocaleString()}</td>
                  <td className="text-right font-mono">{c.total_eggs.toLocaleString()}</td>
                  <td className="text-right font-mono">{c.total_dozens.toLocaleString()}</td>
                  <td className={`text-right font-mono font-bold ${c.feed_conversion <= 4 ? 'text-lvf-success' : c.feed_conversion <= 5 ? 'text-lvf-warning' : 'text-lvf-danger'}`}>
                    {c.feed_conversion.toFixed(2)}
                  </td>
                  <td className="text-right font-mono">${c.feed_cost_per_dozen.toFixed(4)}</td>
                </tr>
              ))}
              {conversion.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No feed conversion data. Record feed deliveries linked to flocks to see data.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ MEDICATIONS ═══════════ */}
      {tab === 'medications' && (
        <div className="space-y-6">
          <div className="glass-card overflow-hidden">
            <table className="w-full glass-table">
              <thead><tr><th>Medication</th><th>Unit</th><th className="text-right">On Hand</th><th className="text-right">Reorder</th><th className="text-right">Cost/Unit</th><th>Vendor</th><th>Status</th></tr></thead>
              <tbody>
                {medications.map(m => (
                  <tr key={m.id} className={!m.is_active ? 'opacity-50' : ''}>
                    <td className="font-medium">{m.name}</td>
                    <td className="text-lvf-muted">{m.unit}</td>
                    <td className={`text-right font-mono font-medium ${m.reorder_level && m.quantity_on_hand <= m.reorder_level ? 'text-lvf-danger' : ''}`}>
                      {m.quantity_on_hand}
                    </td>
                    <td className="text-right font-mono text-lvf-muted">{m.reorder_level ?? '—'}</td>
                    <td className="text-right font-mono">{m.cost_per_unit ? `$${m.cost_per_unit.toFixed(2)}` : '—'}</td>
                    <td className="text-xs text-lvf-muted">{m.vendor_name || '—'}</td>
                    <td>
                      {m.reorder_level && m.quantity_on_hand <= m.reorder_level ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-lvf-danger/20 text-lvf-danger">Low Stock</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-lvf-success/20 text-lvf-success">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
                {medications.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No medications added yet.</td></tr>}
              </tbody>
            </table>
          </div>
          {admins.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-lvf-muted mb-2">Administration Log</h4>
              <div className="glass-card overflow-hidden">
                <table className="w-full glass-table">
                  <thead><tr><th>Date</th><th>Flock</th><th>Medication</th><th className="text-right">Dosage</th><th>By</th><th>Notes</th></tr></thead>
                  <tbody>
                    {admins.map(a => (
                      <tr key={a.id}>
                        <td className="text-lvf-muted">{a.admin_date}</td>
                        <td className="text-lvf-accent">{a.flock_number}</td>
                        <td className="font-medium">{a.medication_name}</td>
                        <td className="text-right font-mono">{a.dosage}</td>
                        <td className="text-xs">{a.administered_by || '—'}</td>
                        <td className="text-xs text-lvf-muted max-w-[200px] truncate">{a.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════ VENDORS ═══════════ */}
      {tab === 'vendors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vendors.map(v => (
            <div key={v.id} className={`glass-card p-4 ${!v.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-lg">{v.name}</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] bg-lvf-accent/10 text-lvf-accent">{v.vendor_type}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEditVendor(v)} className="p-1.5 rounded-lg hover:bg-white/10"><Edit2 size={13} className="text-lvf-muted" /></button>
                  <button onClick={() => handleToggleVendor(v)} className="p-1.5 rounded-lg hover:bg-white/10">
                    {v.is_active ? <ToggleRight size={16} className="text-lvf-success" /> : <ToggleLeft size={16} className="text-lvf-muted" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                {v.contact_name && <p className="text-lvf-muted text-xs">{v.contact_name}</p>}
                {v.phone && <div className="flex items-center gap-2 text-lvf-muted"><Phone size={12} /> {v.phone}</div>}
                {v.email && <div className="flex items-center gap-2 text-lvf-muted"><Mail size={12} /> {v.email}</div>}
                {v.address && <div className="flex items-center gap-2 text-lvf-muted"><MapPin size={12} /> {v.address}</div>}
              </div>
            </div>
          ))}
          {vendors.length === 0 && <div className="col-span-full glass-card p-8 text-center text-lvf-muted">No vendors yet.</div>}
        </div>
      )}

      {/* ═══════════ PURCHASE ORDERS ═══════════ */}
      {tab === 'pos' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead><tr><th>PO #</th><th>Date</th><th>Vendor</th><th>Expected</th><th className="text-right">Amount</th><th>Status</th><th className="w-20"></th></tr></thead>
            <tbody>
              {pos.map(p => (
                <tr key={p.id}>
                  <td className="font-semibold text-lvf-accent font-mono">{p.po_number}</td>
                  <td className="text-lvf-muted">{p.order_date}</td>
                  <td>{p.vendor_name}</td>
                  <td className="text-lvf-muted">{p.expected_date || '—'}</td>
                  <td className="text-right font-mono font-medium">{p.total_amount ? `$${p.total_amount.toFixed(2)}` : '—'}</td>
                  <td><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || ''}`}>{p.status}</span></td>
                  <td>
                    <div className="flex gap-1">
                      {p.status === 'draft' && <button onClick={() => handlePOStatus(p.id, 'submitted')} className="p-1.5 rounded-lg hover:bg-white/10 text-xs text-lvf-accent" title="Submit">Submit</button>}
                      {p.status === 'submitted' && <button onClick={() => handlePOStatus(p.id, 'approved')} className="p-1.5 rounded-lg hover:bg-white/10 text-xs text-lvf-success" title="Approve">Approve</button>}
                      {p.status === 'approved' && <button onClick={() => handlePOStatus(p.id, 'received')} className="p-1.5 rounded-lg hover:bg-white/10 text-xs text-lvf-success" title="Received">Received</button>}
                    </div>
                  </td>
                </tr>
              ))}
              {pos.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-lvf-muted">No purchase orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ MODALS ═══════════ */}

      {/* Feed Delivery Modal */}
      <Modal isOpen={deliveryOpen} onClose={() => setDeliveryOpen(false)} title="Record Feed Delivery" size="lg">
        <form onSubmit={handleCreateDelivery} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Ticket # *</label><input className="glass-input w-full" required value={deliveryForm.ticket_number} onChange={e => setDeliveryForm({ ...deliveryForm, ticket_number: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Date *</label><input className="glass-input w-full" type="date" required value={deliveryForm.delivery_date} onChange={e => setDeliveryForm({ ...deliveryForm, delivery_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Feed Type</label><SearchSelect options={feedTypes} value={feedTypes.find(o => o.value === deliveryForm.feed_type)} onChange={opt => setDeliveryForm({ ...deliveryForm, feed_type: opt?.value || 'layer' })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Barn *</label><SearchSelect options={barnOptions} value={barnOptions.find(o => o.value === deliveryForm.barn_id) || null} onChange={opt => setDeliveryForm({ ...deliveryForm, barn_id: opt?.value || '' })} placeholder="Select barn..." /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Flock</label><SearchSelect options={flockOptions} value={flockOptions.find(o => o.value === deliveryForm.flock_id) || null} onChange={opt => setDeliveryForm({ ...deliveryForm, flock_id: opt?.value || '' })} placeholder="Optional..." isClearable /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Vendor</label><SearchSelect options={vendorOptions} value={vendorOptions.find(o => o.value === deliveryForm.vendor_id) || null} onChange={opt => setDeliveryForm({ ...deliveryForm, vendor_id: opt?.value || '' })} placeholder="Optional..." isClearable /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Tons *</label><input className="glass-input w-full" type="number" step="0.001" min="0" required value={deliveryForm.tons} onChange={e => setDeliveryForm({ ...deliveryForm, tons: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Cost per Ton ($)</label><input className="glass-input w-full" type="number" step="0.01" min="0" value={deliveryForm.cost_per_ton} onChange={e => setDeliveryForm({ ...deliveryForm, cost_per_ton: e.target.value })} /></div>
          </div>
          {deliveryForm.tons && deliveryForm.cost_per_ton && (
            <div className="text-right text-sm">Total: <span className="text-lg font-bold text-lvf-success">${(parseFloat(deliveryForm.tons) * parseFloat(deliveryForm.cost_per_ton)).toFixed(2)}</span></div>
          )}
          <div><label className="block text-sm text-lvf-muted mb-1">Notes</label><textarea className="glass-input w-full" rows={2} value={deliveryForm.notes} onChange={e => setDeliveryForm({ ...deliveryForm, notes: e.target.value })} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setDeliveryOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Saving...' : 'Record Delivery'}</button>
          </div>
        </form>
      </Modal>

      {/* Vendor Modal (create) */}
      <Modal isOpen={vendorOpen} onClose={() => setVendorOpen(false)} title="Add Vendor" size="md">
        <form onSubmit={handleCreateVendor} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Name *</label><input className="glass-input w-full" required value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Type</label><SearchSelect options={vendorTypes} value={vendorTypes.find(o => o.value === vendorForm.vendor_type)} onChange={opt => setVendorForm({ ...vendorForm, vendor_type: opt?.value || 'other' })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Contact</label><input className="glass-input w-full" value={vendorForm.contact_name} onChange={e => setVendorForm({ ...vendorForm, contact_name: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Phone</label><input className="glass-input w-full" value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} /></div>
          </div>
          <div><label className="block text-sm text-lvf-muted mb-1">Email</label><input className="glass-input w-full" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} /></div>
          <div><label className="block text-sm text-lvf-muted mb-1">Address</label><textarea className="glass-input w-full" rows={2} value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setVendorOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Add Vendor'}</button>
          </div>
        </form>
      </Modal>

      {/* Vendor Modal (edit) */}
      <Modal isOpen={editVendorOpen} onClose={() => { setEditVendorOpen(false); setEditVendorTarget(null) }} title={`Edit Vendor — ${editVendorTarget?.name || ''}`} size="md">
        <form onSubmit={handleUpdateVendor} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Name *</label><input className="glass-input w-full" required value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Type</label><SearchSelect options={vendorTypes} value={vendorTypes.find(o => o.value === vendorForm.vendor_type)} onChange={opt => setVendorForm({ ...vendorForm, vendor_type: opt?.value || 'other' })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Contact</label><input className="glass-input w-full" value={vendorForm.contact_name} onChange={e => setVendorForm({ ...vendorForm, contact_name: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Phone</label><input className="glass-input w-full" value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} /></div>
          </div>
          <div><label className="block text-sm text-lvf-muted mb-1">Email</label><input className="glass-input w-full" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} /></div>
          <div><label className="block text-sm text-lvf-muted mb-1">Address</label><textarea className="glass-input w-full" rows={2} value={vendorForm.address} onChange={e => setVendorForm({ ...vendorForm, address: e.target.value })} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => { setEditVendorOpen(false); setEditVendorTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </Modal>

      {/* Medication Modal */}
      <Modal isOpen={medOpen} onClose={() => setMedOpen(false)} title="Add Medication" size="md">
        <form onSubmit={handleCreateMed} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Name *</label><input className="glass-input w-full" required value={medForm.name} onChange={e => setMedForm({ ...medForm, name: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Unit</label><input className="glass-input w-full" value={medForm.unit} placeholder="dose, ml, cc" onChange={e => setMedForm({ ...medForm, unit: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Qty on Hand</label><input className="glass-input w-full" type="number" min="0" value={medForm.quantity_on_hand} onChange={e => setMedForm({ ...medForm, quantity_on_hand: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Reorder Level</label><input className="glass-input w-full" type="number" min="0" value={medForm.reorder_level} onChange={e => setMedForm({ ...medForm, reorder_level: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Cost/Unit ($)</label><input className="glass-input w-full" type="number" step="0.01" min="0" value={medForm.cost_per_unit} onChange={e => setMedForm({ ...medForm, cost_per_unit: e.target.value })} /></div>
          </div>
          <div><label className="block text-sm text-lvf-muted mb-1">Vendor</label><SearchSelect options={vendorOptions} value={vendorOptions.find(o => o.value === medForm.vendor_id) || null} onChange={opt => setMedForm({ ...medForm, vendor_id: opt?.value || '' })} placeholder="Optional..." isClearable /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setMedOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Adding...' : 'Add Medication'}</button>
          </div>
        </form>
      </Modal>

      {/* Administer Medication Modal */}
      <Modal isOpen={adminOpen} onClose={() => setAdminOpen(false)} title="Administer Medication" size="md">
        <form onSubmit={handleAdminMed} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Flock *</label><SearchSelect options={flockOptions} value={flockOptions.find(o => o.value === adminForm.flock_id) || null} onChange={opt => setAdminForm({ ...adminForm, flock_id: opt?.value || '' })} placeholder="Select flock..." /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Medication *</label><SearchSelect options={medOptions} value={medOptions.find(o => o.value === adminForm.medication_id) || null} onChange={opt => setAdminForm({ ...adminForm, medication_id: opt?.value || '' })} placeholder="Select medication..." /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Date *</label><input className="glass-input w-full" type="date" required value={adminForm.admin_date} onChange={e => setAdminForm({ ...adminForm, admin_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Dosage *</label><input className="glass-input w-full" type="number" step="0.01" min="0" required value={adminForm.dosage} onChange={e => setAdminForm({ ...adminForm, dosage: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Administered By</label><input className="glass-input w-full" value={adminForm.administered_by} onChange={e => setAdminForm({ ...adminForm, administered_by: e.target.value })} /></div>
          </div>
          <div><label className="block text-sm text-lvf-muted mb-1">Notes</label><textarea className="glass-input w-full" rows={2} value={adminForm.notes} onChange={e => setAdminForm({ ...adminForm, notes: e.target.value })} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setAdminOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Recording...' : 'Administer'}</button>
          </div>
        </form>
      </Modal>

      {/* Create PO Modal */}
      <Modal isOpen={poOpen} onClose={() => setPoOpen(false)} title="Create Purchase Order" size="lg">
        <form onSubmit={handleCreatePO} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm text-lvf-muted mb-1">Vendor *</label><SearchSelect options={vendorOptions} value={vendorOptions.find(o => o.value === poForm.vendor_id) || null} onChange={opt => setPoForm({ ...poForm, vendor_id: opt?.value || '' })} placeholder="Select vendor..." /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Order Date *</label><input className="glass-input w-full" type="date" required value={poForm.order_date} onChange={e => setPoForm({ ...poForm, order_date: e.target.value })} /></div>
            <div><label className="block text-sm text-lvf-muted mb-1">Expected Date</label><input className="glass-input w-full" type="date" value={poForm.expected_date} onChange={e => setPoForm({ ...poForm, expected_date: e.target.value })} /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-lvf-muted">Line Items</label>
              <button type="button" onClick={addPOLine} className="text-xs text-lvf-accent hover:underline">+ Add Line</button>
            </div>
            <div className="space-y-2">
              {poForm.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4"><input className="glass-input w-full" value={line.description} placeholder="Description *" onChange={e => updatePOLine(idx, 'description', e.target.value)} /></div>
                  <div className="col-span-2"><input className="glass-input w-full" type="number" step="0.01" min="0" value={line.quantity} placeholder="Qty" onChange={e => updatePOLine(idx, 'quantity', e.target.value)} /></div>
                  <div className="col-span-2"><input className="glass-input w-full" value={line.unit} placeholder="Unit" onChange={e => updatePOLine(idx, 'unit', e.target.value)} /></div>
                  <div className="col-span-2"><input className="glass-input w-full" type="number" step="0.01" min="0" value={line.unit_price} placeholder="$/Unit" onChange={e => updatePOLine(idx, 'unit_price', e.target.value)} /></div>
                  <div className="col-span-1 text-right text-xs text-lvf-muted pt-2">{line.quantity && line.unit_price ? `$${(parseFloat(line.quantity) * parseFloat(line.unit_price)).toFixed(2)}` : ''}</div>
                  <div className="col-span-1">{poForm.lines.length > 1 && <button type="button" onClick={() => removePOLine(idx)} className="p-2 text-lvf-danger hover:bg-white/10 rounded-lg"><XCircle size={14} /></button>}</div>
                </div>
              ))}
            </div>
          </div>
          <div><label className="block text-sm text-lvf-muted mb-1">Notes</label><textarea className="glass-input w-full" rows={2} value={poForm.notes} onChange={e => setPoForm({ ...poForm, notes: e.target.value })} /></div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setPoOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">{submitting ? 'Creating...' : 'Create PO'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
