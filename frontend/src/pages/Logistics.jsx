import { useState, useEffect, useMemo } from 'react'
import {
  Plus, Truck, Package, CheckCircle, XCircle, FileText, Eye,
  Users, Calendar, RotateCcw, ChevronLeft, ChevronRight, Download,
  Phone, Mail, Edit2, ToggleLeft, ToggleRight, Building2
} from 'lucide-react'
import {
  getPickups, createPickup, completePickup, cancelPickup,
  getShipments, createShipment, updateShipmentStatus, confirmDelivery, downloadBolPdf,
  getDrivers, createDriver, updateDriver,
  getCarriers, createCarrier, updateCarrier,
  getReturns, createReturn,
  getPickupsCalendar,
} from '../api/logistics'
import { getFlocks } from '../api/flocks'
import { getBarns } from '../api/barns'
import { getEggGrades, getInventorySummary } from '../api/inventory'
import { getContracts } from '../api/contracts'
import SearchSelect from '../components/common/SearchSelect'
import Modal from '../components/common/Modal'
import Toast from '../components/common/Toast'
import useToast from '../hooks/useToast'

export default function Logistics({ embedded = false, activeTab: externalTab = null, showToast: externalShowToast = null }) {
  const [tab, setTab] = useState(externalTab || 'pickups')
  const [pickups, setPickups] = useState([])
  const [shipments, setShipments] = useState([])
  const [flocks, setFlocks] = useState([])
  const [barns, setBarns] = useState([])
  const [grades, setGrades] = useState([])
  const [contracts, setContracts] = useState([])
  const [summary, setSummary] = useState([])
  const [drivers, setDrivers] = useState([])
  const [carriers, setCarriers] = useState([])
  const [returns, setReturns] = useState([])

  // Modal states
  const [createPickupOpen, setCreatePickupOpen] = useState(false)
  const [completePickupOpen, setCompletePickupOpen] = useState(false)
  const [completeTarget, setCompleteTarget] = useState(null)
  const [createShipmentOpen, setCreateShipmentOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTarget, setDetailTarget] = useState(null)
  const [deliveryOpen, setDeliveryOpen] = useState(false)
  const [deliveryTarget, setDeliveryTarget] = useState(null)
  const [createDriverOpen, setCreateDriverOpen] = useState(false)
  const [editDriverOpen, setEditDriverOpen] = useState(false)
  const [editDriverTarget, setEditDriverTarget] = useState(null)
  const [createCarrierOpen, setCreateCarrierOpen] = useState(false)
  const [editCarrierOpen, setEditCarrierOpen] = useState(false)
  const [editCarrierTarget, setEditCarrierTarget] = useState(null)
  const [createReturnOpen, setCreateReturnOpen] = useState(false)
  const [shipmentDetailOpen, setShipmentDetailOpen] = useState(false)
  const [shipmentDetailTarget, setShipmentDetailTarget] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const { toast, showToast, hideToast } = useToast()

  // Calendar state
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [calendarView, setCalendarView] = useState('month')
  const [calendarPickups, setCalendarPickups] = useState([])

  // Forms
  const [pickupForm, setPickupForm] = useState({
    scheduled_date: new Date().toISOString().split('T')[0],
    driver_id: '', driver_name: '', notes: '',
    items: [{ barn_id: '', flock_id: '', skids_estimated: '' }],
  })
  const [completeItems, setCompleteItems] = useState([])
  const [shipmentForm, setShipmentForm] = useState({
    bol_number: '', contract_id: '', ship_date: new Date().toISOString().split('T')[0],
    buyer: '', carrier: '', carrier_id: '', destination: '', freight_cost: '', notes: '',
    lines: [{ flock_id: '', grade: '', skids: '', price_per_dozen: '' }],
  })
  const [deliveryForm, setDeliveryForm] = useState({
    delivered_date: new Date().toISOString().split('T')[0],
    signed_by: '', pod_notes: '',
  })
  const [driverForm, setDriverForm] = useState({
    name: '', phone: '', email: '', license_number: '', truck_type: '', truck_plate: '', notes: '',
  })
  const [carrierForm, setCarrierForm] = useState({
    name: '', contact_name: '', phone: '', email: '', rate_per_mile: '', flat_rate: '', notes: '',
  })
  const [returnForm, setReturnForm] = useState({
    shipment_id: '', return_date: new Date().toISOString().split('T')[0],
    buyer: '', reason: '', notes: '',
    lines: [{ flock_id: '', grade: '', skids: '' }],
  })

  const load = async () => {
    try {
      const [pickupsRes, shipmentsRes, flocksRes, barnsRes, gradesRes, contractsRes, summaryRes, driversRes, carriersRes, returnsRes] = await Promise.all([
        getPickups(), getShipments(), getFlocks({ status: 'active' }), getBarns(),
        getEggGrades(), getContracts({ active_only: true }), getInventorySummary(),
        getDrivers(), getCarriers(), getReturns(),
      ])
      setPickups(pickupsRes.data)
      setShipments(shipmentsRes.data)
      setFlocks(flocksRes.data)
      setBarns(barnsRes.data)
      setGrades(gradesRes.data)
      setContracts(contractsRes.data)
      setSummary(summaryRes.data)
      setDrivers(driversRes.data)
      setCarriers(carriersRes.data)
      setReturns(returnsRes.data)
    } catch (err) {
      showToast('Error loading data', 'error')
    }
  }

  useEffect(() => {
    if (externalTab && externalTab !== tab) setTab(externalTab)
  }, [externalTab])

  const effectiveShowToast = externalShowToast || showToast

  useEffect(() => { load() }, [])

  // Load calendar data when calendar view or date changes
  useEffect(() => {
    if (tab === 'calendar') loadCalendar()
  }, [tab, calendarDate, calendarView])

  const loadCalendar = async () => {
    const { start, end } = getCalendarRange()
    try {
      const res = await getPickupsCalendar(start, end)
      setCalendarPickups(res.data)
    } catch (err) {
      // silent fail for calendar
    }
  }

  const getCalendarRange = () => {
    const d = new Date(calendarDate)
    if (calendarView === 'week') {
      const day = d.getDay()
      const start = new Date(d)
      start.setDate(d.getDate() - day)
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return { start: fmt(start), end: fmt(end) }
    }
    const start = new Date(d.getFullYear(), d.getMonth(), 1)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    return { start: fmt(start), end: fmt(end) }
  }

  const fmt = (d) => d.toISOString().split('T')[0]

  const barnOptions = barns.map(b => ({ value: b.id, label: b.name }))
  const flockOptions = flocks.map(f => ({ value: f.id, label: `${f.flock_number} — ${f.current_bird_count} birds` }))
  const gradeOptions = grades.map(g => ({ value: g.value, label: g.label }))
  const contractOptions = contracts.map(c => ({ value: c.id, label: `${c.contract_number} — ${c.buyer}` }))
  const driverOptions = drivers.filter(d => d.is_active).map(d => ({ value: d.id, label: `${d.name}${d.truck_type ? ` (${d.truck_type})` : ''}` }))
  const carrierOptions = carriers.filter(c => c.is_active).map(c => ({ value: c.id, label: c.name }))
  const shipmentOptions = shipments.map(s => ({ value: s.id, label: `${s.shipment_number} — ${s.buyer}` }))

  // ── Pickup Handlers ──
  const addPickupItem = () => {
    setPickupForm(prev => ({
      ...prev, items: [...prev.items, { barn_id: '', flock_id: '', skids_estimated: '' }]
    }))
  }
  const updatePickupItem = (idx, field, value) => {
    setPickupForm(prev => ({
      ...prev, items: prev.items.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    }))
  }
  const removePickupItem = (idx) => {
    if (pickupForm.items.length <= 1) return
    setPickupForm(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }))
  }

  const handleCreatePickup = async (e) => {
    e.preventDefault()
    if (submitting) return
    const validItems = pickupForm.items.filter(i => i.barn_id && i.flock_id && parseInt(i.skids_estimated) > 0)
    if (validItems.length === 0) {
      showToast('Add at least one barn with estimated skids', 'error'); return
    }
    setSubmitting(true)
    try {
      await createPickup({
        scheduled_date: pickupForm.scheduled_date,
        driver_id: pickupForm.driver_id || null,
        driver_name: pickupForm.driver_name || null,
        notes: pickupForm.notes || null,
        items: validItems.map(i => ({
          barn_id: i.barn_id, flock_id: i.flock_id,
          skids_estimated: parseInt(i.skids_estimated), notes: null,
        }))
      })
      showToast('Pickup job created')
      setCreatePickupOpen(false)
      setPickupForm({
        scheduled_date: new Date().toISOString().split('T')[0],
        driver_id: '', driver_name: '', notes: '',
        items: [{ barn_id: '', flock_id: '', skids_estimated: '' }],
      })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const openComplete = (job) => {
    setCompleteTarget(job)
    setCompleteItems(job.items.map(item => ({
      item_id: item.id, skids_actual: item.skids_estimated,
      grade: grades.length > 0 ? grades[0].value : '',
      barn_name: item.barn_name, flock_number: item.flock_number, skids_estimated: item.skids_estimated,
    })))
    setCompletePickupOpen(true)
  }

  const handleCompletePickup = async () => {
    if (submitting) return
    const items = completeItems.filter(i => parseInt(i.skids_actual) > 0)
    if (items.length === 0) { showToast('Set actual skids and grade for at least one item', 'error'); return }
    for (const item of items) {
      if (!item.grade) { showToast('Please select a grade for all items', 'error'); return }
    }
    setSubmitting(true)
    try {
      await completePickup(completeTarget.id, items.map(i => ({
        item_id: i.item_id, skids_actual: parseInt(i.skids_actual), grade: i.grade,
      })))
      showToast('Pickup completed — skids received into warehouse')
      setCompletePickupOpen(false); setCompleteTarget(null); load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const handleCancelPickup = async (jobId) => {
    try { await cancelPickup(jobId); showToast('Pickup cancelled'); load() }
    catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  // ── Shipment Handlers ──
  const addShipmentLine = () => {
    setShipmentForm(prev => ({
      ...prev, lines: [...prev.lines, { flock_id: '', grade: '', skids: '', price_per_dozen: '' }]
    }))
  }
  const updateShipmentLine = (idx, field, value) => {
    setShipmentForm(prev => ({
      ...prev, lines: prev.lines.map((line, i) => i === idx ? { ...line, [field]: value } : line)
    }))
  }
  const removeShipmentLine = (idx) => {
    if (shipmentForm.lines.length <= 1) return
    setShipmentForm(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }))
  }

  const handleContractSelect = (opt) => {
    const contract = contracts.find(c => c.id === opt?.value)
    setShipmentForm(prev => ({
      ...prev, contract_id: opt?.value || '',
      buyer: contract?.buyer || prev.buyer,
      lines: prev.lines.map(line => ({
        ...line, grade: contract?.grade || line.grade,
        price_per_dozen: contract?.price_per_dozen || line.price_per_dozen,
      }))
    }))
  }

  const handleCarrierSelect = (opt) => {
    const carr = carriers.find(c => c.id === opt?.value)
    setShipmentForm(prev => ({
      ...prev, carrier_id: opt?.value || '', carrier: carr?.name || prev.carrier,
    }))
  }

  const handleCreateShipment = async (e) => {
    e.preventDefault()
    if (submitting) return
    const validLines = shipmentForm.lines.filter(l => l.grade && parseInt(l.skids) > 0)
    if (validLines.length === 0) { showToast('Add at least one line with grade and skids', 'error'); return }
    if (!shipmentForm.bol_number.trim()) { showToast('BOL number is required', 'error'); return }
    if (!shipmentForm.buyer.trim()) { showToast('Buyer is required', 'error'); return }
    setSubmitting(true)
    try {
      await createShipment({
        bol_number: shipmentForm.bol_number,
        contract_id: shipmentForm.contract_id || null,
        ship_date: shipmentForm.ship_date,
        buyer: shipmentForm.buyer,
        carrier: shipmentForm.carrier || null,
        carrier_id: shipmentForm.carrier_id || null,
        destination: shipmentForm.destination || null,
        freight_cost: shipmentForm.freight_cost ? parseFloat(shipmentForm.freight_cost) : null,
        notes: shipmentForm.notes || null,
        lines: validLines.map(l => ({
          flock_id: l.flock_id || null, grade: l.grade, skids: parseInt(l.skids),
          dozens_per_skid: 900,
          price_per_dozen: l.price_per_dozen ? parseFloat(l.price_per_dozen) : null,
        }))
      })
      showToast('Shipment created — inventory deducted')
      setCreateShipmentOpen(false)
      setShipmentForm({
        bol_number: '', contract_id: '', ship_date: new Date().toISOString().split('T')[0],
        buyer: '', carrier: '', carrier_id: '', destination: '', freight_cost: '', notes: '',
        lines: [{ flock_id: '', grade: '', skids: '', price_per_dozen: '' }],
      })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const handleStatusChange = async (shipmentId, newStatus) => {
    try { await updateShipmentStatus(shipmentId, newStatus); showToast(`Shipment marked as ${newStatus}`); load() }
    catch (err) { showToast(err.response?.data?.detail || 'Error', 'error') }
  }

  const openDelivery = (shipment) => {
    setDeliveryTarget(shipment)
    setDeliveryForm({ delivered_date: new Date().toISOString().split('T')[0], signed_by: '', pod_notes: '' })
    setDeliveryOpen(true)
  }

  const handleConfirmDelivery = async () => {
    if (submitting) return
    setSubmitting(true)
    try {
      await confirmDelivery(deliveryTarget.id, {
        delivered_date: deliveryForm.delivered_date,
        signed_by: deliveryForm.signed_by || null,
        pod_notes: deliveryForm.pod_notes || null,
      })
      showToast('Delivery confirmed')
      setDeliveryOpen(false); setDeliveryTarget(null); load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const handleDownloadBol = async (shipmentId) => {
    try {
      const res = await downloadBolPdf(shipmentId)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      const disposition = res.headers['content-disposition']
      const filename = disposition ? disposition.split('filename=')[1] : `BOL-${shipmentId}.pdf`
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      showToast('Error downloading BOL PDF', 'error')
    }
  }

  // ── Driver Handlers ──
  const handleCreateDriver = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!driverForm.name.trim()) { showToast('Driver name is required', 'error'); return }
    setSubmitting(true)
    try {
      await createDriver(driverForm)
      showToast('Driver created')
      setCreateDriverOpen(false)
      setDriverForm({ name: '', phone: '', email: '', license_number: '', truck_type: '', truck_plate: '', notes: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const openEditDriver = (d) => {
    setEditDriverTarget(d)
    setDriverForm({
      name: d.name, phone: d.phone || '', email: d.email || '',
      license_number: d.license_number || '', truck_type: d.truck_type || '',
      truck_plate: d.truck_plate || '', notes: d.notes || '',
    })
    setEditDriverOpen(true)
  }

  const handleUpdateDriver = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await updateDriver(editDriverTarget.id, driverForm)
      showToast('Driver updated')
      setEditDriverOpen(false); setEditDriverTarget(null)
      setDriverForm({ name: '', phone: '', email: '', license_number: '', truck_type: '', truck_plate: '', notes: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const handleToggleDriver = async (d) => {
    try {
      await updateDriver(d.id, { is_active: !d.is_active })
      showToast(d.is_active ? 'Driver deactivated' : 'Driver activated')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    }
  }

  // ── Carrier Handlers ──
  const handleCreateCarrier = async (e) => {
    e.preventDefault()
    if (submitting) return
    if (!carrierForm.name.trim()) { showToast('Carrier name is required', 'error'); return }
    setSubmitting(true)
    try {
      await createCarrier({
        ...carrierForm,
        rate_per_mile: carrierForm.rate_per_mile ? parseFloat(carrierForm.rate_per_mile) : null,
        flat_rate: carrierForm.flat_rate ? parseFloat(carrierForm.flat_rate) : null,
      })
      showToast('Carrier created')
      setCreateCarrierOpen(false)
      setCarrierForm({ name: '', contact_name: '', phone: '', email: '', rate_per_mile: '', flat_rate: '', notes: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const openEditCarrier = (c) => {
    setEditCarrierTarget(c)
    setCarrierForm({
      name: c.name, contact_name: c.contact_name || '', phone: c.phone || '',
      email: c.email || '', rate_per_mile: c.rate_per_mile || '',
      flat_rate: c.flat_rate || '', notes: c.notes || '',
    })
    setEditCarrierOpen(true)
  }

  const handleUpdateCarrier = async (e) => {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      await updateCarrier(editCarrierTarget.id, {
        ...carrierForm,
        rate_per_mile: carrierForm.rate_per_mile ? parseFloat(carrierForm.rate_per_mile) : null,
        flat_rate: carrierForm.flat_rate ? parseFloat(carrierForm.flat_rate) : null,
      })
      showToast('Carrier updated')
      setEditCarrierOpen(false); setEditCarrierTarget(null)
      setCarrierForm({ name: '', contact_name: '', phone: '', email: '', rate_per_mile: '', flat_rate: '', notes: '' })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  const handleToggleCarrier = async (c) => {
    try {
      await updateCarrier(c.id, { is_active: !c.is_active })
      showToast(c.is_active ? 'Carrier deactivated' : 'Carrier activated')
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    }
  }

  // ── Return Handlers ──
  const addReturnLine = () => {
    setReturnForm(prev => ({
      ...prev, lines: [...prev.lines, { flock_id: '', grade: '', skids: '' }]
    }))
  }
  const updateReturnLine = (idx, field, value) => {
    setReturnForm(prev => ({
      ...prev, lines: prev.lines.map((line, i) => i === idx ? { ...line, [field]: value } : line)
    }))
  }
  const removeReturnLine = (idx) => {
    if (returnForm.lines.length <= 1) return
    setReturnForm(prev => ({ ...prev, lines: prev.lines.filter((_, i) => i !== idx) }))
  }

  const handleReturnShipmentSelect = (opt) => {
    const sh = shipments.find(s => s.id === opt?.value)
    setReturnForm(prev => ({
      ...prev, shipment_id: opt?.value || '', buyer: sh?.buyer || prev.buyer,
    }))
  }

  const handleCreateReturn = async (e) => {
    e.preventDefault()
    if (submitting) return
    const validLines = returnForm.lines.filter(l => l.grade && parseInt(l.skids) > 0)
    if (validLines.length === 0) { showToast('Add at least one line with grade and skids', 'error'); return }
    if (!returnForm.buyer.trim()) { showToast('Buyer is required', 'error'); return }
    setSubmitting(true)
    try {
      await createReturn({
        shipment_id: returnForm.shipment_id || null,
        return_date: returnForm.return_date,
        buyer: returnForm.buyer,
        reason: returnForm.reason || null,
        notes: returnForm.notes || null,
        lines: validLines.map(l => ({
          flock_id: l.flock_id || null, grade: l.grade,
          skids: parseInt(l.skids), dozens_per_skid: 900,
        }))
      })
      showToast('Return processed — eggs re-entered into inventory')
      setCreateReturnOpen(false)
      setReturnForm({
        shipment_id: '', return_date: new Date().toISOString().split('T')[0],
        buyer: '', reason: '', notes: '',
        lines: [{ flock_id: '', grade: '', skids: '' }],
      })
      load()
    } catch (err) {
      showToast(err.response?.data?.detail || 'Error', 'error')
    } finally { setSubmitting(false) }
  }

  // ── Calendar Helpers ──
  const calendarNav = (dir) => {
    const d = new Date(calendarDate)
    if (calendarView === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCalendarDate(d)
  }

  const getMonthDays = () => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const days = []
    // Pad start
    for (let i = 0; i < firstDay; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(i)
    return days
  }

  const getWeekDays = () => {
    const d = new Date(calendarDate)
    const day = d.getDay()
    const start = new Date(d)
    start.setDate(d.getDate() - day)
    const days = []
    for (let i = 0; i < 7; i++) {
      const dd = new Date(start)
      dd.setDate(start.getDate() + i)
      days.push(dd)
    }
    return days
  }

  const getPickupsForDate = (dateStr) => calendarPickups.filter(p => p.scheduled_date === dateStr)

  const calcShipmentTotal = () => {
    return shipmentForm.lines.reduce((sum, l) => {
      const skids = parseInt(l.skids) || 0
      const price = parseFloat(l.price_per_dozen) || 0
      return sum + skids * 900 * price
    }, 0)
  }

  const statusColors = {
    pending: 'bg-lvf-warning/20 text-lvf-warning',
    completed: 'bg-lvf-success/20 text-lvf-success',
    shipped: 'bg-lvf-accent/20 text-lvf-accent',
    delivered: 'bg-lvf-success/20 text-lvf-success',
    cancelled: 'bg-lvf-danger/20 text-lvf-danger',
    processed: 'bg-lvf-success/20 text-lvf-success',
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const tabs = [
    { id: 'pickups', label: 'Pickup Jobs', icon: Truck },
    { id: 'shipments', label: 'Shipments & BOL', icon: FileText },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'drivers', label: 'Drivers', icon: Users },
    { id: 'carriers', label: 'Carriers', icon: Building2 },
    { id: 'returns', label: 'Returns', icon: RotateCcw },
  ]

  return (
    <div>
      {!embedded && toast && <Toast {...toast} onClose={hideToast} />}

      {!embedded && (
        <>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Logistics</h2>
            <div className="flex gap-2">
              {tab === 'pickups' && (
                <button onClick={() => setCreatePickupOpen(true)} className="glass-button-primary flex items-center gap-2">
                  <Plus size={16} /> Create Pickup Job
                </button>
              )}
              {tab === 'shipments' && (
                <button onClick={() => setCreateShipmentOpen(true)} className="glass-button-primary flex items-center gap-2">
                  <Plus size={16} /> Create Shipment
                </button>
              )}
              {tab === 'drivers' && (
                <button onClick={() => setCreateDriverOpen(true)} className="glass-button-primary flex items-center gap-2">
                  <Plus size={16} /> Add Driver
                </button>
              )}
              {tab === 'carriers' && (
                <button onClick={() => setCreateCarrierOpen(true)} className="glass-button-primary flex items-center gap-2">
                  <Plus size={16} /> Add Carrier
                </button>
              )}
              {tab === 'returns' && (
                <button onClick={() => setCreateReturnOpen(true)} className="glass-button-primary flex items-center gap-2">
                  <Plus size={16} /> Process Return
                </button>
              )}
            </div>
          </div>

          {/* Warehouse Summary */}
          {summary.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              <div className="glass-card stat-glow p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Package size={14} className="text-lvf-accent" />
                  <p className="text-xs text-lvf-muted">Warehouse Total</p>
                </div>
                <p className="text-2xl font-bold text-lvf-accent">
                  {summary.reduce((s, i) => s + i.total_skids_on_hand, 0).toLocaleString()}
                </p>
                <p className="text-[10px] text-lvf-muted">skids ({summary.reduce((s, i) => s + i.total_dozens, 0).toLocaleString()} doz)</p>
              </div>
              {summary.slice(0, 3).map(s => (
                <div key={s.grade} className="glass-card p-4">
                  <p className="text-xs text-lvf-muted">{s.grade_label}</p>
                  <p className="text-xl font-bold">{s.total_skids_on_hand}</p>
                  <p className="text-[10px] text-lvf-muted">{s.total_dozens.toLocaleString()} doz</p>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-1 mb-4 p-1 glass-card w-fit flex-wrap">
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  tab === t.id ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text hover:bg-white/5'
                }`}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Embedded action buttons */}
      {embedded && (
        <div className="flex gap-2 mb-4">
          {tab === 'pickups' && (
            <button onClick={() => setCreatePickupOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> Create Pickup Job
            </button>
          )}
          {tab === 'shipments' && (
            <button onClick={() => setCreateShipmentOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> Create Shipment
            </button>
          )}
          {tab === 'drivers' && (
            <button onClick={() => setCreateDriverOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> Add Driver
            </button>
          )}
          {tab === 'carriers' && (
            <button onClick={() => setCreateCarrierOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> Add Carrier
            </button>
          )}
          {tab === 'returns' && (
            <button onClick={() => setCreateReturnOpen(true)} className="glass-button-primary flex items-center gap-2">
              <Plus size={16} /> Process Return
            </button>
          )}
        </div>
      )}

      {/* ═══════════ PICKUP JOBS TAB ═══════════ */}
      {tab === 'pickups' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Pickup #</th><th>Date</th><th>Driver</th><th>Barns</th>
                <th className="text-right">Est. Skids</th><th className="text-right">Actual</th>
                <th>Status</th><th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {pickups.map(p => (
                <tr key={p.id}>
                  <td className="font-semibold text-lvf-accent">{p.pickup_number}</td>
                  <td className="text-lvf-muted">{p.scheduled_date}</td>
                  <td>{p.driver_name || '—'}</td>
                  <td className="text-xs">{p.items.map(i => i.barn_name).join(', ')}</td>
                  <td className="text-right font-mono">{p.total_estimated_skids}</td>
                  <td className="text-right font-mono font-medium">{p.status === 'completed' ? p.total_actual_skids : '—'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[p.status] || ''}`}>{p.status}</span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {p.status === 'pending' && (
                        <>
                          <button onClick={() => openComplete(p)} title="Complete Pickup" className="p-1.5 rounded-lg hover:bg-white/10">
                            <CheckCircle size={13} className="text-lvf-success" />
                          </button>
                          <button onClick={() => handleCancelPickup(p.id)} title="Cancel" className="p-1.5 rounded-lg hover:bg-white/10">
                            <XCircle size={13} className="text-lvf-danger" />
                          </button>
                        </>
                      )}
                      <button onClick={() => { setDetailTarget(p); setDetailOpen(true) }} title="View Details" className="p-1.5 rounded-lg hover:bg-white/10">
                        <Eye size={13} className="text-lvf-muted" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {pickups.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-lvf-muted">No pickup jobs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ SHIPMENTS TAB ═══════════ */}
      {tab === 'shipments' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Shipment #</th><th>BOL</th><th>Date</th><th>Buyer</th><th>Contract</th>
                <th>Carrier</th><th className="text-right">Skids</th><th className="text-right">Amount</th>
                <th className="text-right">Freight</th><th>Status</th><th className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {shipments.map(s => (
                <tr key={s.id}>
                  <td className="font-semibold text-lvf-accent">{s.shipment_number}</td>
                  <td className="font-mono text-xs">{s.bol_number}</td>
                  <td className="text-lvf-muted">{s.ship_date}</td>
                  <td>{s.buyer}</td>
                  <td className="text-xs text-lvf-muted">{s.contract_number || '—'}</td>
                  <td className="text-xs">{s.carrier || s.carrier_name || '—'}</td>
                  <td className="text-right font-mono">{s.total_skids}</td>
                  <td className="text-right font-mono font-medium text-lvf-success">
                    {s.total_amount > 0 ? `$${s.total_amount.toFixed(2)}` : '—'}
                  </td>
                  <td className="text-right font-mono text-xs text-lvf-muted">
                    {s.freight_cost ? `$${s.freight_cost.toFixed(2)}` : '—'}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[s.status] || ''}`}>{s.status}</span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      {s.status === 'pending' && (
                        <button onClick={() => handleStatusChange(s.id, 'shipped')} title="Mark Shipped" className="p-1.5 rounded-lg hover:bg-white/10">
                          <Truck size={13} className="text-lvf-accent" />
                        </button>
                      )}
                      {s.status === 'shipped' && (
                        <button onClick={() => openDelivery(s)} title="Confirm Delivery" className="p-1.5 rounded-lg hover:bg-white/10">
                          <CheckCircle size={13} className="text-lvf-success" />
                        </button>
                      )}
                      <button onClick={() => handleDownloadBol(s.id)} title="Download BOL PDF" className="p-1.5 rounded-lg hover:bg-white/10">
                        <Download size={13} className="text-lvf-muted" />
                      </button>
                      <button onClick={() => { setShipmentDetailTarget(s); setShipmentDetailOpen(true) }} title="View Details" className="p-1.5 rounded-lg hover:bg-white/10">
                        <Eye size={13} className="text-lvf-muted" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {shipments.length === 0 && (
                <tr><td colSpan={11} className="text-center py-8 text-lvf-muted">No shipments yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ CALENDAR TAB ═══════════ */}
      {tab === 'calendar' && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button onClick={() => calendarNav(-1)} className="p-2 rounded-lg hover:bg-white/10"><ChevronLeft size={16} /></button>
              <h3 className="text-lg font-semibold">
                {calendarView === 'month'
                  ? `${monthNames[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`
                  : `Week of ${getWeekDays()[0].toLocaleDateString()}`
                }
              </h3>
              <button onClick={() => calendarNav(1)} className="p-2 rounded-lg hover:bg-white/10"><ChevronRight size={16} /></button>
            </div>
            <div className="flex gap-1 p-1 glass-card">
              {['week', 'month'].map(v => (
                <button key={v} onClick={() => setCalendarView(v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    calendarView === v ? 'bg-lvf-accent/20 text-lvf-accent' : 'text-lvf-muted hover:text-lvf-text'
                  }`}>
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {calendarView === 'month' ? (
            <div>
              <div className="grid grid-cols-7 gap-px mb-1">
                {dayNames.map(d => (
                  <div key={d} className="text-center text-xs text-lvf-muted font-semibold py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px">
                {getMonthDays().map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="min-h-[80px] bg-lvf-dark/30 rounded-lg" />
                  const dateStr = `${calendarDate.getFullYear()}-${String(calendarDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                  const dayPickups = getPickupsForDate(dateStr)
                  const isToday = dateStr === fmt(new Date())
                  return (
                    <div key={day} className={`min-h-[80px] p-1.5 rounded-lg border ${isToday ? 'border-lvf-accent/40 bg-lvf-accent/5' : 'border-lvf-border/30 bg-lvf-dark/20'}`}>
                      <div className={`text-xs font-medium mb-1 ${isToday ? 'text-lvf-accent' : 'text-lvf-muted'}`}>{day}</div>
                      <div className="space-y-0.5">
                        {dayPickups.map(p => (
                          <div key={p.id}
                            className={`text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer ${
                              p.status === 'completed' ? 'bg-lvf-success/20 text-lvf-success' :
                              p.status === 'cancelled' ? 'bg-lvf-danger/20 text-lvf-danger' :
                              'bg-lvf-accent/20 text-lvf-accent'
                            }`}
                            onClick={() => { setDetailTarget(p); setDetailOpen(true) }}
                            title={`${p.pickup_number} — ${p.driver_name || 'No driver'}`}>
                            {p.pickup_number}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {getWeekDays().map(day => {
                const dateStr = fmt(day)
                const dayPickups = getPickupsForDate(dateStr)
                const isToday = dateStr === fmt(new Date())
                return (
                  <div key={dateStr} className={`rounded-xl border p-3 min-h-[200px] ${isToday ? 'border-lvf-accent/40 bg-lvf-accent/5' : 'border-lvf-border/30 bg-lvf-dark/20'}`}>
                    <div className={`text-xs font-semibold mb-2 ${isToday ? 'text-lvf-accent' : 'text-lvf-muted'}`}>
                      {dayNames[day.getDay()]} {day.getDate()}
                    </div>
                    <div className="space-y-1.5">
                      {dayPickups.map(p => (
                        <div key={p.id}
                          className={`text-xs p-2 rounded-lg cursor-pointer transition-all hover:scale-[1.02] ${
                            p.status === 'completed' ? 'bg-lvf-success/15 border border-lvf-success/20' :
                            p.status === 'cancelled' ? 'bg-lvf-danger/15 border border-lvf-danger/20' :
                            'bg-lvf-accent/15 border border-lvf-accent/20'
                          }`}
                          onClick={() => { setDetailTarget(p); setDetailOpen(true) }}>
                          <div className="font-medium">{p.pickup_number}</div>
                          <div className="text-lvf-muted text-[10px]">{p.driver_name || 'No driver'}</div>
                          <div className="text-lvf-muted text-[10px]">{p.items.length} barn{p.items.length !== 1 ? 's' : ''} — {p.total_estimated_skids} skids</div>
                        </div>
                      ))}
                      {dayPickups.length === 0 && (
                        <p className="text-[10px] text-lvf-muted/50 text-center mt-4">No pickups</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ DRIVERS TAB ═══════════ */}
      {tab === 'drivers' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {drivers.map(d => (
            <div key={d.id} className={`glass-card p-4 ${!d.is_active ? 'opacity-50' : ''}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-semibold text-lg">{d.name}</h4>
                  <p className="text-xs text-lvf-muted font-mono">{d.driver_number}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEditDriver(d)} className="p-1.5 rounded-lg hover:bg-white/10" title="Edit">
                    <Edit2 size={13} className="text-lvf-muted" />
                  </button>
                  <button onClick={() => handleToggleDriver(d)} className="p-1.5 rounded-lg hover:bg-white/10"
                    title={d.is_active ? 'Deactivate' : 'Activate'}>
                    {d.is_active
                      ? <ToggleRight size={16} className="text-lvf-success" />
                      : <ToggleLeft size={16} className="text-lvf-muted" />
                    }
                  </button>
                </div>
              </div>
              <div className="space-y-1.5 text-sm">
                {d.phone && (
                  <div className="flex items-center gap-2 text-lvf-muted">
                    <Phone size={12} /> {d.phone}
                  </div>
                )}
                {d.email && (
                  <div className="flex items-center gap-2 text-lvf-muted">
                    <Mail size={12} /> {d.email}
                  </div>
                )}
                {(d.truck_type || d.truck_plate) && (
                  <div className="flex items-center gap-2 text-lvf-muted">
                    <Truck size={12} />
                    {[d.truck_type, d.truck_plate].filter(Boolean).join(' — ')}
                  </div>
                )}
                {d.license_number && (
                  <p className="text-xs text-lvf-muted">License: {d.license_number}</p>
                )}
              </div>
            </div>
          ))}
          {drivers.length === 0 && (
            <div className="col-span-full glass-card p-8 text-center text-lvf-muted">
              No drivers yet. Click "Add Driver" to create one.
            </div>
          )}
        </div>
      )}

      {/* ═══════════ CARRIERS TAB ═══════════ */}
      {tab === 'carriers' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Name</th><th>Contact</th><th>Phone</th><th>Email</th>
                <th className="text-right">Rate/Mile</th><th className="text-right">Flat Rate</th>
                <th>Status</th><th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {carriers.map(c => (
                <tr key={c.id} className={!c.is_active ? 'opacity-50' : ''}>
                  <td className="font-semibold">{c.name}</td>
                  <td className="text-lvf-muted">{c.contact_name || '—'}</td>
                  <td className="text-lvf-muted text-xs">{c.phone || '—'}</td>
                  <td className="text-lvf-muted text-xs">{c.email || '—'}</td>
                  <td className="text-right font-mono">{c.rate_per_mile ? `$${c.rate_per_mile.toFixed(2)}` : '—'}</td>
                  <td className="text-right font-mono">{c.flat_rate ? `$${c.flat_rate.toFixed(2)}` : '—'}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.is_active ? 'bg-lvf-success/20 text-lvf-success' : 'bg-lvf-danger/20 text-lvf-danger'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={() => openEditCarrier(c)} className="p-1.5 rounded-lg hover:bg-white/10" title="Edit">
                        <Edit2 size={13} className="text-lvf-muted" />
                      </button>
                      <button onClick={() => handleToggleCarrier(c)} className="p-1.5 rounded-lg hover:bg-white/10"
                        title={c.is_active ? 'Deactivate' : 'Activate'}>
                        {c.is_active
                          ? <ToggleRight size={16} className="text-lvf-success" />
                          : <ToggleLeft size={16} className="text-lvf-muted" />
                        }
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {carriers.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-lvf-muted">No carriers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ RETURNS TAB ═══════════ */}
      {tab === 'returns' && (
        <div className="glass-card overflow-hidden">
          <table className="w-full glass-table">
            <thead>
              <tr>
                <th>Return #</th><th>Date</th><th>Buyer</th><th>Shipment</th>
                <th>Reason</th><th className="text-right">Skids</th><th className="text-right">Dozens</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {returns.map(r => (
                <tr key={r.id}>
                  <td className="font-semibold text-lvf-accent">{r.return_number}</td>
                  <td className="text-lvf-muted">{r.return_date}</td>
                  <td>{r.buyer}</td>
                  <td className="text-xs text-lvf-muted">{r.shipment_number || '—'}</td>
                  <td className="text-xs max-w-[200px] truncate">{r.reason || '—'}</td>
                  <td className="text-right font-mono">{r.total_skids}</td>
                  <td className="text-right font-mono text-lvf-muted">{r.total_dozens.toLocaleString()}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status] || ''}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
              {returns.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-lvf-muted">No returns yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ MODALS ═══════════ */}

      {/* Create Pickup Modal */}
      <Modal isOpen={createPickupOpen} onClose={() => setCreatePickupOpen(false)} title="Create Pickup Job" size="lg">
        <form onSubmit={handleCreatePickup} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Scheduled Date *</label>
              <input className="glass-input w-full" type="date" required value={pickupForm.scheduled_date}
                onChange={e => setPickupForm({ ...pickupForm, scheduled_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Driver</label>
              <SearchSelect options={driverOptions}
                value={driverOptions.find(o => o.value === pickupForm.driver_id) || null}
                onChange={(opt) => setPickupForm({ ...pickupForm, driver_id: opt?.value || '', driver_name: '' })}
                placeholder="Select driver..." isClearable />
            </div>
          </div>
          {!pickupForm.driver_id && (
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Driver Name (manual)</label>
              <input className="glass-input w-full" value={pickupForm.driver_name} placeholder="Type driver name if not in list"
                onChange={e => setPickupForm({ ...pickupForm, driver_name: e.target.value })} />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-lvf-muted">Barn Pickups</label>
              <button type="button" onClick={addPickupItem} className="text-xs text-lvf-accent hover:underline">+ Add Barn</button>
            </div>
            <div className="space-y-2">
              {pickupForm.items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <SearchSelect options={barnOptions}
                      value={barnOptions.find(o => o.value === item.barn_id) || null}
                      onChange={(opt) => updatePickupItem(idx, 'barn_id', opt?.value || '')}
                      placeholder="Barn..." />
                  </div>
                  <div className="col-span-4">
                    <SearchSelect options={flockOptions}
                      value={flockOptions.find(o => o.value === item.flock_id) || null}
                      onChange={(opt) => updatePickupItem(idx, 'flock_id', opt?.value || '')}
                      placeholder="Flock..." />
                  </div>
                  <div className="col-span-3">
                    <input className="glass-input w-full" type="number" min="0" value={item.skids_estimated}
                      placeholder="Skids" onChange={e => updatePickupItem(idx, 'skids_estimated', e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    {pickupForm.items.length > 1 && (
                      <button type="button" onClick={() => removePickupItem(idx)}
                        className="p-2 text-lvf-danger hover:bg-white/10 rounded-lg"><XCircle size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={pickupForm.notes}
              onChange={e => setPickupForm({ ...pickupForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreatePickupOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Creating...' : 'Create Pickup Job'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Complete Pickup Modal */}
      <Modal isOpen={completePickupOpen} onClose={() => { setCompletePickupOpen(false); setCompleteTarget(null) }}
        title={`Complete Pickup ${completeTarget?.pickup_number || ''}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-lvf-muted">Set actual skids picked up and egg grade for each barn. Eggs will be auto-received into the warehouse.</p>
          <div className="space-y-3">
            {completeItems.map((item, idx) => (
              <div key={item.item_id} className="glass-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-medium">{item.barn_name}</p>
                    <p className="text-xs text-lvf-muted">Flock: {item.flock_number} — Est: {item.skids_estimated} skids</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-lvf-muted mb-1">Actual Skids *</label>
                    <input className="glass-input w-full" type="number" min="0" value={item.skids_actual}
                      onChange={e => {
                        const updated = [...completeItems]
                        updated[idx] = { ...updated[idx], skids_actual: e.target.value }
                        setCompleteItems(updated)
                      }} />
                  </div>
                  <div>
                    <label className="block text-xs text-lvf-muted mb-1">Egg Grade *</label>
                    <SearchSelect options={gradeOptions}
                      value={gradeOptions.find(o => o.value === item.grade) || null}
                      onChange={(opt) => {
                        const updated = [...completeItems]
                        updated[idx] = { ...updated[idx], grade: opt?.value || '' }
                        setCompleteItems(updated)
                      }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => { setCompletePickupOpen(false); setCompleteTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button onClick={handleCompletePickup} disabled={submitting} className="glass-button-primary">
              {submitting ? 'Processing...' : 'Complete & Receive'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Shipment Modal */}
      <Modal isOpen={createShipmentOpen} onClose={() => setCreateShipmentOpen(false)} title="Create Shipment" size="xl">
        <form onSubmit={handleCreateShipment} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">BOL Number *</label>
              <input className="glass-input w-full" required value={shipmentForm.bol_number} placeholder="e.g. BOL-12345"
                onChange={e => setShipmentForm({ ...shipmentForm, bol_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Ship Date *</label>
              <input className="glass-input w-full" type="date" required value={shipmentForm.ship_date}
                onChange={e => setShipmentForm({ ...shipmentForm, ship_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contract</label>
              <SearchSelect options={contractOptions}
                value={contractOptions.find(o => o.value === shipmentForm.contract_id) || null}
                onChange={handleContractSelect} placeholder="Optional..." isClearable />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Buyer *</label>
              <input className="glass-input w-full" required value={shipmentForm.buyer}
                onChange={e => setShipmentForm({ ...shipmentForm, buyer: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Carrier</label>
              <SearchSelect options={carrierOptions}
                value={carrierOptions.find(o => o.value === shipmentForm.carrier_id) || null}
                onChange={handleCarrierSelect} placeholder="Select carrier..." isClearable />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Destination</label>
              <input className="glass-input w-full" value={shipmentForm.destination} placeholder="Delivery address"
                onChange={e => setShipmentForm({ ...shipmentForm, destination: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Freight Cost ($)</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0" value={shipmentForm.freight_cost}
                placeholder="0.00" onChange={e => setShipmentForm({ ...shipmentForm, freight_cost: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-lvf-muted">Shipment Lines</label>
              <button type="button" onClick={addShipmentLine} className="text-xs text-lvf-accent hover:underline">+ Add Line</button>
            </div>
            <div className="space-y-2">
              {shipmentForm.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3">
                    <SearchSelect options={flockOptions}
                      value={flockOptions.find(o => o.value === line.flock_id) || null}
                      onChange={(opt) => updateShipmentLine(idx, 'flock_id', opt?.value || '')}
                      placeholder="Flock..." isClearable />
                  </div>
                  <div className="col-span-3">
                    <SearchSelect options={gradeOptions}
                      value={gradeOptions.find(o => o.value === line.grade) || null}
                      onChange={(opt) => updateShipmentLine(idx, 'grade', opt?.value || '')}
                      placeholder="Grade..." />
                  </div>
                  <div className="col-span-2">
                    <input className="glass-input w-full" type="number" min="1" value={line.skids}
                      placeholder="Skids" onChange={e => updateShipmentLine(idx, 'skids', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <input className="glass-input w-full" type="number" step="0.01" min="0" value={line.price_per_dozen}
                      placeholder="$/Doz" onChange={e => updateShipmentLine(idx, 'price_per_dozen', e.target.value)} />
                  </div>
                  <div className="col-span-1 text-right text-xs text-lvf-muted pt-2">
                    {(parseInt(line.skids) || 0) * 900} doz
                  </div>
                  <div className="col-span-1">
                    {shipmentForm.lines.length > 1 && (
                      <button type="button" onClick={() => removeShipmentLine(idx)}
                        className="p-2 text-lvf-danger hover:bg-white/10 rounded-lg"><XCircle size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {calcShipmentTotal() > 0 && (
            <div className="text-right text-sm">
              Total: <span className="text-lg font-bold text-lvf-success">${calcShipmentTotal().toFixed(2)}</span>
            </div>
          )}

          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={shipmentForm.notes}
              onChange={e => setShipmentForm({ ...shipmentForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateShipmentOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Creating...' : 'Create Shipment'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delivery Confirmation Modal */}
      <Modal isOpen={deliveryOpen} onClose={() => { setDeliveryOpen(false); setDeliveryTarget(null) }}
        title={`Confirm Delivery — ${deliveryTarget?.shipment_number || ''}`} size="md">
        <div className="space-y-4">
          <p className="text-sm text-lvf-muted">Record proof of delivery for this shipment.</p>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Delivery Date *</label>
            <input className="glass-input w-full" type="date" value={deliveryForm.delivered_date}
              onChange={e => setDeliveryForm({ ...deliveryForm, delivered_date: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Signed By</label>
            <input className="glass-input w-full" value={deliveryForm.signed_by} placeholder="Name of person who signed"
              onChange={e => setDeliveryForm({ ...deliveryForm, signed_by: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Delivery Notes</label>
            <textarea className="glass-input w-full" rows={3} value={deliveryForm.pod_notes} placeholder="Proof of delivery notes..."
              onChange={e => setDeliveryForm({ ...deliveryForm, pod_notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => { setDeliveryOpen(false); setDeliveryTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button onClick={handleConfirmDelivery} disabled={submitting} className="glass-button-primary">
              {submitting ? 'Confirming...' : 'Confirm Delivery'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Pickup Detail Modal */}
      <Modal isOpen={detailOpen} onClose={() => { setDetailOpen(false); setDetailTarget(null) }}
        title={`Pickup ${detailTarget?.pickup_number || ''}`} size="lg">
        {detailTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-lvf-muted">Date</p>
                <p className="font-medium">{detailTarget.scheduled_date}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Driver</p>
                <p className="font-medium">{detailTarget.driver_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Status</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[detailTarget.status]}`}>
                  {detailTarget.status}
                </span>
              </div>
            </div>
            <table className="w-full glass-table">
              <thead>
                <tr><th>Barn</th><th>Flock</th><th className="text-right">Estimated</th><th className="text-right">Actual</th><th>Grade</th></tr>
              </thead>
              <tbody>
                {detailTarget.items.map(item => (
                  <tr key={item.id}>
                    <td className="font-medium">{item.barn_name}</td>
                    <td className="text-lvf-accent">{item.flock_number}</td>
                    <td className="text-right font-mono">{item.skids_estimated}</td>
                    <td className="text-right font-mono font-medium">{item.skids_actual ?? '—'}</td>
                    <td>{item.grade_label || item.grade || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {detailTarget.notes && <p className="text-xs text-lvf-muted">{detailTarget.notes}</p>}
          </div>
        )}
      </Modal>

      {/* Shipment Detail Modal */}
      <Modal isOpen={shipmentDetailOpen} onClose={() => { setShipmentDetailOpen(false); setShipmentDetailTarget(null) }}
        title={`Shipment ${shipmentDetailTarget?.shipment_number || ''}`} size="lg">
        {shipmentDetailTarget && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-lvf-muted">BOL #</p>
                <p className="font-medium font-mono">{shipmentDetailTarget.bol_number}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Ship Date</p>
                <p className="font-medium">{shipmentDetailTarget.ship_date}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Status</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[shipmentDetailTarget.status]}`}>
                  {shipmentDetailTarget.status}
                </span>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Buyer</p>
                <p className="font-medium">{shipmentDetailTarget.buyer}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Carrier</p>
                <p className="font-medium">{shipmentDetailTarget.carrier || shipmentDetailTarget.carrier_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-lvf-muted">Destination</p>
                <p className="font-medium">{shipmentDetailTarget.destination || '—'}</p>
              </div>
            </div>
            {shipmentDetailTarget.freight_cost && (
              <div className="text-sm">
                <span className="text-lvf-muted">Freight Cost: </span>
                <span className="font-mono font-medium">${shipmentDetailTarget.freight_cost.toFixed(2)}</span>
              </div>
            )}
            {shipmentDetailTarget.delivered_date && (
              <div className="glass-card p-3 bg-lvf-success/5 border-lvf-success/20">
                <p className="text-xs text-lvf-success font-medium mb-1">Delivery Confirmed</p>
                <div className="grid grid-cols-3 gap-2 text-xs text-lvf-muted">
                  <div>Date: <span className="text-lvf-text">{shipmentDetailTarget.delivered_date}</span></div>
                  <div>Signed by: <span className="text-lvf-text">{shipmentDetailTarget.signed_by || '—'}</span></div>
                  {shipmentDetailTarget.pod_notes && <div>Notes: <span className="text-lvf-text">{shipmentDetailTarget.pod_notes}</span></div>}
                </div>
              </div>
            )}
            <table className="w-full glass-table">
              <thead>
                <tr><th>Flock</th><th>Grade</th><th className="text-right">Skids</th><th className="text-right">Dozens</th><th className="text-right">$/Doz</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {shipmentDetailTarget.lines.map(line => (
                  <tr key={line.id}>
                    <td className="text-lvf-accent">{line.flock_number || '—'}</td>
                    <td>{line.grade_label}</td>
                    <td className="text-right font-mono">{line.skids}</td>
                    <td className="text-right font-mono text-lvf-muted">{line.total_dozens.toLocaleString()}</td>
                    <td className="text-right font-mono">{line.price_per_dozen ? `$${line.price_per_dozen.toFixed(4)}` : '—'}</td>
                    <td className="text-right font-mono font-medium text-lvf-success">{line.line_total ? `$${line.line_total.toFixed(2)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-right text-sm">
              <span className="text-lvf-muted">Total: </span>
              <span className="text-lg font-bold text-lvf-success">${shipmentDetailTarget.total_amount.toFixed(2)}</span>
            </div>
            {shipmentDetailTarget.notes && <p className="text-xs text-lvf-muted">{shipmentDetailTarget.notes}</p>}
          </div>
        )}
      </Modal>

      {/* Create Driver Modal */}
      <Modal isOpen={createDriverOpen} onClose={() => setCreateDriverOpen(false)} title="Add Driver" size="md">
        <form onSubmit={handleCreateDriver} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Name *</label>
            <input className="glass-input w-full" required value={driverForm.name} placeholder="Driver name"
              onChange={e => setDriverForm({ ...driverForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Phone</label>
              <input className="glass-input w-full" value={driverForm.phone} placeholder="555-0100"
                onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Email</label>
              <input className="glass-input w-full" type="email" value={driverForm.email} placeholder="driver@example.com"
                onChange={e => setDriverForm({ ...driverForm, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">License Number</label>
              <input className="glass-input w-full" value={driverForm.license_number} placeholder="CDL#"
                onChange={e => setDriverForm({ ...driverForm, license_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Truck Type</label>
              <input className="glass-input w-full" value={driverForm.truck_type} placeholder="e.g. Refrigerated 53ft"
                onChange={e => setDriverForm({ ...driverForm, truck_type: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Truck Plate</label>
            <input className="glass-input w-full" value={driverForm.truck_plate} placeholder="License plate"
              onChange={e => setDriverForm({ ...driverForm, truck_plate: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={driverForm.notes}
              onChange={e => setDriverForm({ ...driverForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateDriverOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Creating...' : 'Add Driver'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Driver Modal */}
      <Modal isOpen={editDriverOpen} onClose={() => { setEditDriverOpen(false); setEditDriverTarget(null) }}
        title={`Edit Driver — ${editDriverTarget?.name || ''}`} size="md">
        <form onSubmit={handleUpdateDriver} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Name *</label>
            <input className="glass-input w-full" required value={driverForm.name}
              onChange={e => setDriverForm({ ...driverForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Phone</label>
              <input className="glass-input w-full" value={driverForm.phone}
                onChange={e => setDriverForm({ ...driverForm, phone: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Email</label>
              <input className="glass-input w-full" type="email" value={driverForm.email}
                onChange={e => setDriverForm({ ...driverForm, email: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">License Number</label>
              <input className="glass-input w-full" value={driverForm.license_number}
                onChange={e => setDriverForm({ ...driverForm, license_number: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Truck Type</label>
              <input className="glass-input w-full" value={driverForm.truck_type}
                onChange={e => setDriverForm({ ...driverForm, truck_type: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Truck Plate</label>
            <input className="glass-input w-full" value={driverForm.truck_plate}
              onChange={e => setDriverForm({ ...driverForm, truck_plate: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={driverForm.notes}
              onChange={e => setDriverForm({ ...driverForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => { setEditDriverOpen(false); setEditDriverTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Carrier Modal */}
      <Modal isOpen={createCarrierOpen} onClose={() => setCreateCarrierOpen(false)} title="Add Carrier" size="md">
        <form onSubmit={handleCreateCarrier} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Company Name *</label>
            <input className="glass-input w-full" required value={carrierForm.name} placeholder="Trucking company name"
              onChange={e => setCarrierForm({ ...carrierForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contact Name</label>
              <input className="glass-input w-full" value={carrierForm.contact_name} placeholder="Contact person"
                onChange={e => setCarrierForm({ ...carrierForm, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Phone</label>
              <input className="glass-input w-full" value={carrierForm.phone} placeholder="555-0100"
                onChange={e => setCarrierForm({ ...carrierForm, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Email</label>
            <input className="glass-input w-full" type="email" value={carrierForm.email} placeholder="carrier@example.com"
              onChange={e => setCarrierForm({ ...carrierForm, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Rate per Mile ($)</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0" value={carrierForm.rate_per_mile}
                placeholder="0.00" onChange={e => setCarrierForm({ ...carrierForm, rate_per_mile: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flat Rate ($)</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0" value={carrierForm.flat_rate}
                placeholder="0.00" onChange={e => setCarrierForm({ ...carrierForm, flat_rate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={carrierForm.notes}
              onChange={e => setCarrierForm({ ...carrierForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateCarrierOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Creating...' : 'Add Carrier'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Carrier Modal */}
      <Modal isOpen={editCarrierOpen} onClose={() => { setEditCarrierOpen(false); setEditCarrierTarget(null) }}
        title={`Edit Carrier — ${editCarrierTarget?.name || ''}`} size="md">
        <form onSubmit={handleUpdateCarrier} className="space-y-4">
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Company Name *</label>
            <input className="glass-input w-full" required value={carrierForm.name}
              onChange={e => setCarrierForm({ ...carrierForm, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Contact Name</label>
              <input className="glass-input w-full" value={carrierForm.contact_name}
                onChange={e => setCarrierForm({ ...carrierForm, contact_name: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Phone</label>
              <input className="glass-input w-full" value={carrierForm.phone}
                onChange={e => setCarrierForm({ ...carrierForm, phone: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Email</label>
            <input className="glass-input w-full" type="email" value={carrierForm.email}
              onChange={e => setCarrierForm({ ...carrierForm, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Rate per Mile ($)</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0" value={carrierForm.rate_per_mile}
                onChange={e => setCarrierForm({ ...carrierForm, rate_per_mile: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Flat Rate ($)</label>
              <input className="glass-input w-full" type="number" step="0.01" min="0" value={carrierForm.flat_rate}
                onChange={e => setCarrierForm({ ...carrierForm, flat_rate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={carrierForm.notes}
              onChange={e => setCarrierForm({ ...carrierForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => { setEditCarrierOpen(false); setEditCarrierTarget(null) }} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Process Return Modal */}
      <Modal isOpen={createReturnOpen} onClose={() => setCreateReturnOpen(false)} title="Process Egg Return" size="lg">
        <form onSubmit={handleCreateReturn} className="space-y-4">
          <p className="text-sm text-lvf-muted">Record eggs returned/rejected by a buyer. Skids will be re-entered into warehouse inventory.</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Return Date *</label>
              <input className="glass-input w-full" type="date" required value={returnForm.return_date}
                onChange={e => setReturnForm({ ...returnForm, return_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Original Shipment</label>
              <SearchSelect options={shipmentOptions}
                value={shipmentOptions.find(o => o.value === returnForm.shipment_id) || null}
                onChange={handleReturnShipmentSelect} placeholder="Optional..." isClearable />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Buyer *</label>
              <input className="glass-input w-full" required value={returnForm.buyer}
                onChange={e => setReturnForm({ ...returnForm, buyer: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm text-lvf-muted mb-1">Reason</label>
              <input className="glass-input w-full" value={returnForm.reason} placeholder="e.g. Quality issue, wrong grade"
                onChange={e => setReturnForm({ ...returnForm, reason: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-lvf-muted">Return Lines</label>
              <button type="button" onClick={addReturnLine} className="text-xs text-lvf-accent hover:underline">+ Add Line</button>
            </div>
            <div className="space-y-2">
              {returnForm.lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-4">
                    <SearchSelect options={flockOptions}
                      value={flockOptions.find(o => o.value === line.flock_id) || null}
                      onChange={(opt) => updateReturnLine(idx, 'flock_id', opt?.value || '')}
                      placeholder="Flock..." isClearable />
                  </div>
                  <div className="col-span-4">
                    <SearchSelect options={gradeOptions}
                      value={gradeOptions.find(o => o.value === line.grade) || null}
                      onChange={(opt) => updateReturnLine(idx, 'grade', opt?.value || '')}
                      placeholder="Grade..." />
                  </div>
                  <div className="col-span-3">
                    <input className="glass-input w-full" type="number" min="1" value={line.skids}
                      placeholder="Skids" onChange={e => updateReturnLine(idx, 'skids', e.target.value)} />
                  </div>
                  <div className="col-span-1">
                    {returnForm.lines.length > 1 && (
                      <button type="button" onClick={() => removeReturnLine(idx)}
                        className="p-2 text-lvf-danger hover:bg-white/10 rounded-lg"><XCircle size={14} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-lvf-muted mb-1">Notes</label>
            <textarea className="glass-input w-full" rows={2} value={returnForm.notes}
              onChange={e => setReturnForm({ ...returnForm, notes: e.target.value })} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setCreateReturnOpen(false)} className="glass-button-secondary">Cancel</button>
            <button type="submit" disabled={submitting} className="glass-button-primary">
              {submitting ? 'Processing...' : 'Process Return'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
