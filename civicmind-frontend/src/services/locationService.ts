import { LocationSelection } from "../types/report.types";

export class LocationService {
  /**
   * Capture user browser GPS coordinates.
   */
  static getCurrentGPSLocation(): Promise<{ lat: number; lng: number }> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser."));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          reject(new Error(error.message || "Failed to capture location coordinates."));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  /**
   * Reverse geocode coordinate into address and ward.
   */
  static async reverseGeocode(lat: number, lng: number): Promise<LocationSelection> {
    // Check if Google Maps is initialized
    if (typeof window !== "undefined" && (window as any).google && (window as any).google.maps) {
      try {
        const geocoder = new (window as any).google.maps.Geocoder();
        const response = await geocoder.geocode({ location: { lat, lng } });

        if (response.results && response.results.length > 0) {
          const result = response.results[0];
          const address = result.formatted_address;

          let ward = "Ward 1";
          let city = "Pune";

          // Extract components
          for (const component of result.address_components) {
            if (component.types.includes("sublocality_level_2") || component.types.includes("sublocality")) {
              ward = component.long_name;
            }
            if (component.types.includes("locality")) {
              city = component.long_name;
            }
          }

          return { lat, lng, address, ward, city };
        }
      } catch (err) {
        console.warn("Google Maps reverse geocoding failed, using fallback:", err);
      }
    }

    // Default Pune Fallback
    return {
      lat,
      lng,
      address: `Viman Nagar Road, Pune, Maharashtra 411014`,
      ward: "Viman Nagar",
      city: "Pune",
    };
  }
}
