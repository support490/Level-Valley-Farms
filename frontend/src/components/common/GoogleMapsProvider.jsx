import { createContext, useContext } from 'react'
import { useJsApiLoader } from '@react-google-maps/api'

const GOOGLE_MAPS_API_KEY = 'AIzaSyBQYcihgUhFIyIRHX-_AXlCWGd5WuaAJos'
const LIBRARIES = ['places']

const GoogleMapsContext = createContext({ isLoaded: false })

export function useGoogleMaps() {
  return useContext(GoogleMapsContext)
}

export default function GoogleMapsProvider({ children }) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    libraries: LIBRARIES,
  })

  return (
    <GoogleMapsContext.Provider value={{ isLoaded }}>
      {children}
    </GoogleMapsContext.Provider>
  )
}
