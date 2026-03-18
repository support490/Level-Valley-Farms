import { useRef, useEffect } from 'react'
import { useGoogleMaps } from './GoogleMapsProvider'

export default function AddressAutocomplete({ value, onChange, onSelect, placeholder, className, style }) {
  const inputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const { isLoaded } = useGoogleMaps()

  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['address'],
      componentRestrictions: { country: 'us' },
    })

    ac.addListener('place_changed', () => {
      const place = ac.getPlace()
      if (!place.geometry) return
      const address = place.formatted_address || ''
      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()

      // Extract address components
      const components = {}
      for (const comp of (place.address_components || [])) {
        for (const type of comp.types) {
          components[type] = comp.short_name
          components[type + '_long'] = comp.long_name
        }
      }

      onChange(address)
      if (onSelect) onSelect(address, lat, lng, components)
    })

    autocompleteRef.current = ac
  }, [isLoaded])

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder || 'Enter address...'}
      className={className || 'glass-input w-full'}
      style={style}
    />
  )
}
