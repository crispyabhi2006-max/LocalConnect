declare namespace google {
  namespace maps {
    namespace places {
      interface AddressComponent {
        longText?: string | null;
        shortText?: string | null;
        types: string[];
      }

      interface PlaceResult {
        id?: string;
        displayName?: string;
        formattedAddress?: string;
        location?: {
          lat: () => number;
          lng: () => number;
        };
        addressComponents?: AddressComponent[];
        fetchFields: (options: { fields: string[] }) => Promise<void>;
      }

      interface AutocompleteSuggestion {
        placePrediction?: {
          text: {
            text: string;
          };
          toPlace: () => PlaceResult;
        };
      }

      class AutocompleteSessionToken {}

      const AutocompleteSuggestion: {
        fetchAutocompleteSuggestions: (request: {
          input: string;
          sessionToken?: AutocompleteSessionToken;
        }) => Promise<{ suggestions: AutocompleteSuggestion[] }>;
      };
    }
  }
}
