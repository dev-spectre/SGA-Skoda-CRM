import { LocationNode } from './types';

// ==========================================
// Unicode Lookalike Translation Map
// Converts stylized unicode, Cyrillic, and Greek homoglyphs to plain ASCII
// ==========================================
export const UNICODE_LOOKALIKES: Record<string, string> = {
  // Cyrillic & Greek lookalikes commonly found in social media names / phone input
  'т': 't', 'α': 'a', 'м': 'm', 'ι': 'i', 'ℓ': 'l', 'и': 'n', '∂': 'd', 'υ': 'u',
  'в': 'b', 'с': 'c', 'е': 'e', 'н': 'h', 'к': 'k', 'о': 'o', 'р': 'p', 'ѕ': 's',
  'х': 'x', 'у': 'y', 'я': 'r', 'Т': 't', 'А': 'a', 'М': 'm', 'И': 'n', 'В': 'b',
  'С': 'c', 'Е': 'e', 'Н': 'h', 'К': 'k', 'О': 'o', 'Р': 'p', 'Х': 'x', 'У': 'y',
  'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'η': 'h', 'θ': 'th', 'λ': 'l', 'μ': 'm',
  'ν': 'n', 'ξ': 'x', 'π': 'p', 'ρ': 'r', 'σ': 's', 'τ': 't', 'φ': 'ph', 'ω': 'o'
};



// ==========================================
// Tamil Script to Canonical English Name Mapping
// Maps native Tamil script cities/towns directly to English canonical names
// ==========================================
export const TAMIL_SCRIPT_MAP: Record<string, string> = {
  "தமிழ்நாடு": "Tamil Nadu",
  "சென்னை": "Chennai",
  "கோவை": "Coimbatore",
  "கோயம்புத்தூர்": "Coimbatore",
  "சேலம்": "Salem",
  "ஈரோடு": "Erode",
  "திருப்பூர்": "Tiruppur",
  "மதுரை": "Madurai",
  "திருச்சி": "Tiruchirappalli",
  "திருச்சிராப்பள்ளி": "Tiruchirappalli",
  "நெல்லை": "Tirunelveli",
  "திருநெல்வேலி": "Tirunelveli",
  "தஞ்சாவூர்": "Thanjavur",
  "தஞ்சை": "Thanjavur",
  "திண்டுக்கல்": "Dindigul",
  "வேலூர்": "Vellore",
  "நாமக்கல்": "Namakkal",
  "கரூர்": "Karur",
  "ஊட்டி": "Udhagamandalam",
  "உதகமண்டலம்": "Udhagamandalam",
  "உடுமலைப்பேட்டை": "Udumalaipettai",
  "உடுமலை": "Udumalaipettai",
  "மேட்டூர்": "Mettur",
  "திருச்செங்கோடு": "Tiruchengode",
  "அரவக்குறிச்சி": "Aravakurichi",
  "பொள்ளாச்சி": "Pollachi",
  "கும்பகோணம்": "Kumbakonam",
  "பட்டுக்கோட்டை": "Pattukkottai",
  "நாகர்கோவில்": "Nagercoil",
  "கன்னியாகுமரி": "Nagercoil",
  "தூத்துக்குடி": "Thoothukudi",
  "விருதுநகர்": "Virudhunagar",
  "சிவகங்கை": "Sivaganga",
  "காரைக்குடி": "Karaikudi",
  "புதுக்கோட்டை": "Pudukkottai",
  "பெரம்பலூர்": "Perambalur",
  "அரியலூர்": "Ariyalur",
  "கடலூர்": "Cuddalore",
  "விழுப்புரம்": "Viluppuram",
  "கள்ளக்குறிச்சி": "Kallakurichi",
  "திருவண்ணாமலை": "Tiruvannamalai",
  "காஞ்சிபுரம்": "Kanchipuram",
  "செங்கல்பட்டு": "Chengalpattu",
  "திருவள்ளூர்": "Tiruvallur",
  "தர்மபுரி": "Dharmapuri",
  "கிருஷ்ணகிரி": "Krishnagiri",
  "ஹோசூர்": "Hosur",
  "ஓசூர்": "Hosur",
  "தென்காசி": "Tenkasi",
  "தேனி": "Theni",
  "நீலகிரி": "Udhagamandalam",
  "ஆனைமலை": "Anaimalai",
  "வெள்ளக்கோவில்": "Vellakovil",
  "சிறுமுகை": "Sirumugai",
  "பாபநாசம்": "Papanasam",
  "திருச்செந்தூர்": "Tiruchendur",
  "சென்னிமலை": "Chennimalai",
  "கம்பம்": "Cumbum",
  "சிங்கம்புணரி": "Singampunari",
  "ஆலங்குளம்": "Alangulam",
  "திட்டக்குடி": "Tittagudi",
  "வேதாரண்யம்": "Vedaranyam",
  "மதுராந்தகம்": "Madurantakam",
  "செம்மணங்கூர்": "Semmanangur",
  "கோயம்பேடு": "Koyambedu",
  "அண்ணா நகர்": "Anna Nagar",
  "அடையாறு": "Adyar",
  "மயிலாப்பூர்": "Mylapore",
  "சேத்துப்பட்டு": "Chetpet",
  "பெரம்பூர்": "Perambur",
  "அம்பத்தூர்": "Ambattur",
  "போரூர்": "Porur",
  "சோழிங்கநல்லூர்": "Sholinganallur",
  "சிங்கநல்லூர்": "Singanallur",
  "சரவணம்பட்டி": "Saravanampatti",
  "காந்திபுரம்": "Gandhipuram",
  "பீளமேடு": "Peelamedu",
  "துடியலூர்": "Thudiyalur",
  "மேட்டுப்பாளையம்": "Mettupalayam",
  "காரமடை": "Karamadai",
  "அன்னூர்": "Annur",
  "சூலூர்": "Sulur",
  "வால்பாறை": "Valparai",
  "கிணத்துக்கடவு": "Kinathukadavu",
  "மடுக்கரை": "Madukkarai",
  "பேரூர்": "Perur",
  "குனியமுத்தூர்": "Kuniyamuthur",
  "சுந்தராபுரம்": "Sundarapuram",
  "அவிநாசி": "Avinashi",
  "பல்லடம்": "Palladam",
  "காங்கேயம்": "Kangeyam",
  "தாராபுரம்": "Dharapuram",
  "மடத்துக்குளம்": "Madathukulam",
  "ஊத்துக்குளி": "Uthukuli",
  "குன்னூர்": "Coonoor",
  "கோத்தகிரி": "Kotagiri",
  "கூடலூர்": "Gudalur",
  "ஆத்தூர்": "Attur",
  "ஓமலூர்": "Omalur",
  "எடப்பாடி": "Edappadi",
  "சங்ககிரி": "Sankari",
  "ஏற்காடு": "Yercaud",
  "வாழப்பாடி": "Vazhapadi",
  "மேச்சேரி": "Mecheri",
  "ஜலகண்டாபுரம்": "Jalakandapuram",
  "கங்கவல்லி": "Gangavalli",
  "தம்மம்பட்டி": "Thammampatti",
  "ராசிபுரம்": "Rasipuram",
  "பரமத்தி வேலூர்": "Paramathi Velur",
  "குமாரபாளையம்": "Komarapalayam",
  "மல்லசமுத்திரம்": "Mallasamudram",
  "சேந்தமங்கலம்": "Sendamangalam",
  "மோகனூர்": "Mohanur",
  "கொல்லிமலை": "Kolli Hills",
  "பெருந்துறை": "Perundurai",
  "பவானி": "Bhavani",
  "கோபிசெட்டிபாளையம்": "Gobichettipalayam",
  "கோபி": "Gobichettipalayam",
  "சத்தியமங்கலம்": "Sathyamangalam",
  "சத்தி": "Sathyamangalam",
  "அந்தியூர்": "Anthiyur",
  "கொடுமுடி": "Kodumudi",
  "மொடக்குறிச்சி": "Modakkurichi",
  "திருமங்கலம்": "Thirumangalam",
  "டி.கல்லுப்பட்டி": "T.Kallupatti",
  "மேலூர்": "Melur",
  "உசிலம்பட்டி": "Usilampatti",
  "வாடிப்பட்டி": "Vadipatti",
  "சோழவந்தான்": "Sholavandan",
  "பேரையூர்": "Peraiyur",
  "பழனி": "Palani",
  "கொடைக்கானல்": "Kodaikanal",
  "ஒட்டன்சத்திரம்": "Oddanchatram",
  "நத்தம்": "Natham",
  "நிலக்கோட்டை": "Nilakottai",
  "வத்தலகுண்டு": "Batlagundu",
  "வேடசந்தூர்": "Vedasandur",
  "பெரியகுளம்": "Periyakulam",
  "போடிநாயக்கனூர்": "Bodinayakanur",
  "போடி": "Bodinayakanur",
  "உத்தமபாளையம்": "Uthamapalayam",
  "சின்னமனூர்": "Chinnamanur",
  "ஆண்டிபட்டி": "Andipatti",
  "ஸ்ரீரங்கம்": "Srirangam",
  "மணப்பாறை": "Manapparai",
  "முசிறி": "Musiri",
  "துறையூர்": "Thuraiyur",
  "லால்குடி": "Lalgudi",
  "தொட்டியம்": "Thottiyam",
  "குளித்தலை": "Kulithalai",
  "மன்னார்குடி": "Mannargudi",
  "திருத்துறைப்பூண்டி": "Thiruthuraipoondi",
  "வேளாங்கண்ணி": "Velankanni",
  "சீர்காழி": "Sirkazhi",
  "அறந்தாங்கி": "Aranthangi",
  "ஏம்பலம்": "Embalam",
  "ராஜபாளையம்": "Rajapalayam",
  "ஸ்ரீவில்லிபுத்தூர்": "Srivilliputhur",
  "அருப்புக்கோட்டை": "Aruppukkottai",
  "அம்பாசமுத்திரம்": "Ambasamudram",
  "நாங்குநேரி": "Nanguneri",
  "ராதாபுரம்": "Radhapuram",
  "சங்கரன்கோவில்": "Sankarankovil",
  "கடையநல்லூர்": "Kadayanallur",
  "செங்கோட்டை": "Shenkottai",
  "கோவில்பட்டி": "Kovilpatti",
  "கானம்": "Kanam",
  "மார்த்தாண்டம்": "Marthandam",
  "பண்ருட்டி": "Panruti",
  "சிதம்பரம்": "Chidambaram",
  "நெய்வேலி": "Neyveli",
  "விருத்தாசலம்": "Vridhachalam",
  "திண்டிவனம்": "Tindivanam",
  "உளுந்தூர்பேட்டை": "Ulundurpet",
  "காட்பாடி": "Katpadi",
  "அரக்கோணம்": "Arakkonam",
  "ஆம்பூர்": "Ambur",
  "வாணியம்பாடி": "Vaniyambadi",
  "ஆரணி": "Arani",
  "ஸ்ரீபெரும்புதூர்": "Sriperumbudur",
  "தாம்பரம்": "Tambaram",
  "ஆவடி": "Avadi",
  "பூந்தமல்லி": "Poonamallee",
  "அரூர்": "Harur",
  "ராமேஸ்வரம்": "Rameswaram",
  "பாண்டிச்சேரி": "Puducherry",
  "புதுச்சேரி": "Puducherry"
};

// ==========================================
// Comprehensive Tamil Nadu Geographical Locations
// ==========================================
export const TN_LOCATIONS: LocationNode[] = [
  {
    "id": "state-tamilnadu",
    "name": "Tamil Nadu",
    "district": "Tamil Nadu",
    "type": "state",
    "latitude": 10.9989,
    "longitude": 77.0215,
    "pincodes": [],
    "aliases": [
      "tamilnadu",
      "tamil nadu",
      "tamil",
      "tamizhnadu",
      "tn",
      "tamil nadu state",
      "tamilnadu state",
      "தமிழ்நாடு"
    ]
  },
  {
    "id": "dist-chennai",
    "name": "Chennai",
    "district": "Chennai",
    "type": "district",
    "latitude": 13.0827,
    "longitude": 80.2707,
    "pincodes": [
      "600001",
      "600002",
      "600003",
      "600004",
      "600005",
      "600006",
      "600008",
      "600014",
      "600017",
      "600018",
      "600028",
      "600034",
      "600040",
      "600041",
      "600042",
      "600083",
      "600096"
    ],
    "aliases": [
      "madras",
      "ms",
      "mds",
      "chenai",
      "chenna",
      "chennai city",
      "channi",
      "சென்னை"
    ]
  },
  {
    "id": "loc-koyambedu",
    "name": "Koyambedu",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.0694,
    "longitude": 80.1948,
    "pincodes": [
      "600107"
    ],
    "aliases": [
      "koyembedu",
      "koyambedu market",
      "cmbt",
      "கோயம்பேடு"
    ]
  },
  {
    "id": "loc-annanagar",
    "name": "Anna Nagar",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.085,
    "longitude": 80.2101,
    "pincodes": [
      "600040",
      "600101",
      "600102"
    ],
    "aliases": [
      "annanagar",
      "anna nagar west",
      "anna nagar east",
      "அண்ணா நகர்"
    ]
  },
  {
    "id": "loc-tnagar",
    "name": "T. Nagar",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.0418,
    "longitude": 80.2341,
    "pincodes": [
      "600017"
    ],
    "aliases": [
      "tnagar",
      "t nagar",
      "thyagaraya nagar",
      "panagal park",
      "தி நகர்"
    ]
  },
  {
    "id": "loc-vadapalani",
    "name": "Vadapalani",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.05,
    "longitude": 80.2121,
    "pincodes": [
      "600026"
    ],
    "aliases": [
      "vadapalani temple",
      "வடபழனி"
    ]
  },
  {
    "id": "loc-guindy",
    "name": "Guindy",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.0067,
    "longitude": 80.2025,
    "pincodes": [
      "600032"
    ],
    "aliases": [
      "guindy industrial estate",
      "கிண்டி"
    ]
  },
  {
    "id": "loc-velachery",
    "name": "Velachery",
    "district": "Chennai",
    "type": "hub",
    "latitude": 12.9759,
    "longitude": 80.2212,
    "pincodes": [
      "600042"
    ],
    "aliases": [
      "velacheri",
      "வேளச்சேரி"
    ]
  },
  {
    "id": "loc-adyar",
    "name": "Adyar",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.0012,
    "longitude": 80.2565,
    "pincodes": [
      "600020"
    ],
    "aliases": [
      "adeyar",
      " அடையாறு"
    ]
  },
  {
    "id": "loc-mylapore",
    "name": "Mylapore",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.0368,
    "longitude": 80.2676,
    "pincodes": [
      "600004"
    ],
    "aliases": [
      "mailapore",
      "kapaleeshwarar",
      "மயிலாப்பூர்"
    ]
  },
  {
    "id": "loc-chetpet-chennai",
    "name": "Chetpet",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.0732,
    "longitude": 80.2407,
    "pincodes": [
      "600031"
    ],
    "aliases": [
      "chetpat",
      "chetpet chennai",
      "சேத்துப்பட்டு"
    ]
  },
  {
    "id": "loc-perambur",
    "name": "Perambur",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.1075,
    "longitude": 80.2434,
    "pincodes": [
      "600011"
    ],
    "aliases": [
      "channi600011",
      "icf perambur",
      "பெரம்பூர்"
    ]
  },
  {
    "id": "loc-ambattur",
    "name": "Ambattur",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.1143,
    "longitude": 80.1481,
    "pincodes": [
      "600053",
      "600058"
    ],
    "aliases": [
      "ambattur ot",
      "அம்பத்தூர்"
    ]
  },
  {
    "id": "loc-porur",
    "name": "Porur",
    "district": "Chennai",
    "type": "hub",
    "latitude": 13.0382,
    "longitude": 80.1565,
    "pincodes": [
      "600116"
    ],
    "aliases": [
      "போரூர்"
    ]
  },
  {
    "id": "loc-sholinganallur",
    "name": "Sholinganallur",
    "district": "Chennai",
    "type": "hub",
    "latitude": 12.901,
    "longitude": 80.2279,
    "pincodes": [
      "600119"
    ],
    "aliases": [
      "omr",
      "omr it corridor",
      "சோழிங்கநல்லூர்"
    ]
  },
  {
    "id": "dist-coimbatore",
    "name": "Coimbatore",
    "district": "Coimbatore",
    "type": "district",
    "latitude": 11.0168,
    "longitude": 76.9558,
    "pincodes": [
      "641001",
      "641002",
      "641003",
      "641012",
      "641018",
      "641028",
      "641044",
      "641045"
    ],
    "aliases": [
      "cbe",
      "kovai",
      "coimbator",
      "combay",
      "coimbatore city",
      "koyamputhoor",
      "koyambuthur",
      "கோவை",
      "கோயம்புத்தூர்"
    ]
  },
  {
    "id": "loc-singanallur",
    "name": "Singanallur",
    "district": "Coimbatore",
    "type": "hub",
    "latitude": 10.9989,
    "longitude": 77.0215,
    "pincodes": [
      "641005"
    ],
    "aliases": [
      "singanallur bus stand",
      "singanalloor",
      "சிங்கநல்லூர்"
    ]
  },
  {
    "id": "loc-saravanampatti",
    "name": "Saravanampatti",
    "district": "Coimbatore",
    "type": "hub",
    "latitude": 11.0709,
    "longitude": 77.0028,
    "pincodes": [
      "641035"
    ],
    "aliases": [
      "saravanampatty",
      "saravanampatti cbe",
      "சரவணம்பட்டி"
    ]
  },
  {
    "id": "loc-gandhipuram",
    "name": "Gandhipuram",
    "district": "Coimbatore",
    "type": "hub",
    "latitude": 11.0183,
    "longitude": 76.9654,
    "pincodes": [
      "641012"
    ],
    "aliases": [
      "gandhipuram cbe",
      "காந்திபுரம்"
    ]
  },
  {
    "id": "loc-peelamedu",
    "name": "Peelamedu",
    "district": "Coimbatore",
    "type": "hub",
    "latitude": 11.0268,
    "longitude": 76.9942,
    "pincodes": [
      "641004"
    ],
    "aliases": [
      "peelamedu airport",
      "பீளமேடு"
    ]
  },
  {
    "id": "loc-thudiyalur",
    "name": "Thudiyalur",
    "district": "Coimbatore",
    "type": "hub",
    "latitude": 11.0808,
    "longitude": 76.9408,
    "pincodes": [
      "641034"
    ],
    "aliases": [
      "thudiyaloor",
      "துடியலூர்"
    ]
  },
  {
    "id": "loc-mettupalayam",
    "name": "Mettupalayam",
    "district": "Coimbatore",
    "type": "taluk",
    "latitude": 11.3006,
    "longitude": 76.9452,
    "pincodes": [
      "641301",
      "641305"
    ],
    "aliases": [
      "mtp",
      "mettupalayam town",
      "மேட்டுப்பாளையம்"
    ]
  },
  {
    "id": "loc-sirumugai",
    "name": "Sirumugai",
    "district": "Coimbatore",
    "type": "town",
    "latitude": 11.3195,
    "longitude": 77.0033,
    "pincodes": [
      "641302"
    ],
    "aliases": [
      "sirumukai",
      "sirumugai town",
      "சிறுமுகை"
    ]
  },
  {
    "id": "loc-karamadai",
    "name": "Karamadai",
    "district": "Coimbatore",
    "type": "town",
    "latitude": 11.245,
    "longitude": 76.96,
    "pincodes": [
      "641104"
    ],
    "aliases": [
      "kaaramadai",
      "காரமடை"
    ]
  },
  {
    "id": "loc-annur",
    "name": "Annur",
    "district": "Coimbatore",
    "type": "taluk",
    "latitude": 11.2333,
    "longitude": 77.1333,
    "pincodes": [
      "641653"
    ],
    "aliases": [
      "annoor",
      "அன்னூர்"
    ]
  },
  {
    "id": "loc-sulur",
    "name": "Sulur",
    "district": "Coimbatore",
    "type": "taluk",
    "latitude": 11.0267,
    "longitude": 77.1267,
    "pincodes": [
      "641402"
    ],
    "aliases": [
      "soolur",
      "sulur air force",
      "சூலூர்"
    ]
  },
  {
    "id": "loc-pollachi",
    "name": "Pollachi",
    "district": "Coimbatore",
    "type": "city",
    "latitude": 10.6583,
    "longitude": 77.0084,
    "pincodes": [
      "642001",
      "642002",
      "642003"
    ],
    "aliases": [
      "polachi",
      "pollachy",
      "பொள்ளாச்சி"
    ]
  },
  {
    "id": "loc-anaimalai",
    "name": "Anaimalai",
    "district": "Coimbatore",
    "type": "taluk",
    "latitude": 10.5847,
    "longitude": 76.9318,
    "pincodes": [
      "642104"
    ],
    "aliases": [
      "anamalai",
      "anaimalai hills",
      "ஆனைமலை"
    ]
  },
  {
    "id": "loc-valparai",
    "name": "Valparai",
    "district": "Coimbatore",
    "type": "taluk",
    "latitude": 10.3267,
    "longitude": 76.9554,
    "pincodes": [
      "642127"
    ],
    "aliases": [
      "vaalparai",
      "வால்பாறை"
    ]
  },
  {
    "id": "loc-kinathukadavu",
    "name": "Kinathukadavu",
    "district": "Coimbatore",
    "type": "taluk",
    "latitude": 10.82,
    "longitude": 77.02,
    "pincodes": [
      "642109"
    ],
    "aliases": [
      "kinathukadavoo",
      "கிணத்துக்கடவு"
    ]
  },
  {
    "id": "loc-madukkarai",
    "name": "Madukkarai",
    "district": "Coimbatore",
    "type": "taluk",
    "latitude": 10.9,
    "longitude": 76.96,
    "pincodes": [
      "641105"
    ],
    "aliases": [
      "madukkarai market",
      "மடுக்கரை"
    ]
  },
  {
    "id": "loc-perur",
    "name": "Perur",
    "district": "Coimbatore",
    "type": "town",
    "latitude": 10.97,
    "longitude": 76.92,
    "pincodes": [
      "641010"
    ],
    "aliases": [
      "perur temple",
      "பேரூர்"
    ]
  },
  {
    "id": "loc-thondamuthur",
    "name": "Thondamuthur",
    "district": "Coimbatore",
    "type": "town",
    "latitude": 10.99,
    "longitude": 76.84,
    "pincodes": [
      "641109"
    ],
    "aliases": [
      "தொண்டாமுத்தூர்"
    ]
  },
  {
    "id": "loc-kuniyamuthur",
    "name": "Kuniyamuthur",
    "district": "Coimbatore",
    "type": "hub",
    "latitude": 10.9633,
    "longitude": 76.9533,
    "pincodes": [
      "641008"
    ],
    "aliases": [
      "kuniamuthur",
      "குனியமுத்தூர்"
    ]
  },
  {
    "id": "loc-sundarapuram",
    "name": "Sundarapuram",
    "district": "Coimbatore",
    "type": "hub",
    "latitude": 10.9483,
    "longitude": 76.9783,
    "pincodes": [
      "641024"
    ],
    "aliases": [
      "சுந்தராபுரம்"
    ]
  },
  {
    "id": "dist-tiruppur",
    "name": "Tiruppur",
    "district": "Tiruppur",
    "type": "district",
    "latitude": 11.1085,
    "longitude": 77.3411,
    "pincodes": [
      "641601",
      "641602",
      "641603",
      "641604",
      "641605",
      "641607",
      "641608"
    ],
    "aliases": [
      "tpr",
      "tirupur",
      "thiruppur",
      "thirupur",
      "knit city",
      "திருப்பூர்"
    ]
  },
  {
    "id": "loc-avinashi",
    "name": "Avinashi",
    "district": "Tiruppur",
    "type": "taluk",
    "latitude": 11.1942,
    "longitude": 77.2694,
    "pincodes": [
      "641654",
      "641652"
    ],
    "aliases": [
      "avinasi",
      "avinaasi",
      "avanashi",
      "அவிநாசி"
    ]
  },
  {
    "id": "loc-palladam",
    "name": "Palladam",
    "district": "Tiruppur",
    "type": "taluk",
    "latitude": 10.9997,
    "longitude": 77.2917,
    "pincodes": [
      "641664"
    ],
    "aliases": [
      "paladam",
      "பல்லடம்"
    ]
  },
  {
    "id": "loc-kangeyam",
    "name": "Kangeyam",
    "district": "Tiruppur",
    "type": "taluk",
    "latitude": 11.0064,
    "longitude": 77.5614,
    "pincodes": [
      "638701"
    ],
    "aliases": [
      "kangayam",
      "காங்கேயம்"
    ]
  },
  {
    "id": "loc-vellakovil",
    "name": "Vellakovil",
    "district": "Tiruppur",
    "type": "town",
    "latitude": 10.9333,
    "longitude": 77.7167,
    "pincodes": [
      "638111"
    ],
    "aliases": [
      "vellakoil",
      "vellakovil town",
      "வெள்ளக்கோவில்"
    ]
  },
  {
    "id": "loc-dharapuram",
    "name": "Dharapuram",
    "district": "Tiruppur",
    "type": "taluk",
    "latitude": 10.7289,
    "longitude": 77.5256,
    "pincodes": [
      "638656",
      "638657"
    ],
    "aliases": [
      "dharaburam",
      "தாராபுரம்"
    ]
  },
  {
    "id": "loc-udumalaipettai",
    "name": "Udumalaipettai",
    "district": "Tiruppur",
    "type": "city",
    "latitude": 10.5847,
    "longitude": 77.2483,
    "pincodes": [
      "642126",
      "642128"
    ],
    "aliases": [
      "udumalpet",
      "udumalpettai",
      "udt",
      "udumalai",
      "உடுமலைப்பேட்டை",
      "உடுமலை"
    ]
  },
  {
    "id": "loc-madathukulam",
    "name": "Madathukulam",
    "district": "Tiruppur",
    "type": "taluk",
    "latitude": 10.57,
    "longitude": 77.37,
    "pincodes": [
      "642113"
    ],
    "aliases": [
      "மடத்துக்குளம்"
    ]
  },
  {
    "id": "loc-uthukuli",
    "name": "Uthukuli",
    "district": "Tiruppur",
    "type": "taluk",
    "latitude": 11.16,
    "longitude": 77.45,
    "pincodes": [
      "638751"
    ],
    "aliases": [
      "oothukuli",
      "ஊத்துக்குளி"
    ]
  },
  {
    "id": "dist-nilgiris",
    "name": "Udhagamandalam",
    "district": "Nilgiris",
    "type": "district",
    "latitude": 11.4102,
    "longitude": 76.695,
    "pincodes": [
      "643001",
      "643002",
      "643004"
    ],
    "aliases": [
      "ooty",
      "nilgiris",
      "udhagai",
      "ootacamund",
      "blue mountains",
      "நீலகிரி",
      "ஊட்டி",
      "உதகமண்டலம்"
    ]
  },
  {
    "id": "loc-coonoor",
    "name": "Coonoor",
    "district": "Nilgiris",
    "type": "town",
    "latitude": 11.353,
    "longitude": 76.7959,
    "pincodes": [
      "643101",
      "643102"
    ],
    "aliases": [
      "cunoor",
      "குன்னூர்"
    ]
  },
  {
    "id": "loc-kotagiri",
    "name": "Kotagiri",
    "district": "Nilgiris",
    "type": "town",
    "latitude": 11.4333,
    "longitude": 76.8833,
    "pincodes": [
      "643217"
    ],
    "aliases": [
      "kothagiri",
      "கோத்தகிரி"
    ]
  },
  {
    "id": "loc-gudalur-nilgiris",
    "name": "Gudalur",
    "district": "Nilgiris",
    "type": "taluk",
    "latitude": 11.5,
    "longitude": 76.5,
    "pincodes": [
      "643211"
    ],
    "aliases": [
      "gudalur nilgiris",
      "கூடலூர்"
    ]
  },
  {
    "id": "loc-wellington",
    "name": "Wellington",
    "district": "Nilgiris",
    "type": "town",
    "latitude": 11.37,
    "longitude": 76.79,
    "pincodes": [
      "643231"
    ],
    "aliases": [
      "வெலிங்டன்"
    ]
  },
  {
    "id": "loc-aruvankadu",
    "name": "Aruvankadu",
    "district": "Nilgiris",
    "type": "town",
    "latitude": 11.36,
    "longitude": 76.81,
    "pincodes": [
      "643202"
    ],
    "aliases": [
      "aruvankadu cordite",
      "அரவங்காடு"
    ]
  },
  {
    "id": "dist-salem",
    "name": "Salem",
    "district": "Salem",
    "type": "district",
    "latitude": 11.6643,
    "longitude": 78.146,
    "pincodes": [
      "636001",
      "636002",
      "636004",
      "636005",
      "636007",
      "636008",
      "636009",
      "636015",
      "636016"
    ],
    "aliases": [
      "slm",
      "selam",
      "saalem",
      "salem city",
      "mango city",
      "சேலம்"
    ]
  },
  {
    "id": "loc-mettur",
    "name": "Mettur",
    "district": "Salem",
    "type": "city",
    "latitude": 11.7967,
    "longitude": 77.8011,
    "pincodes": [
      "636401",
      "636402",
      "636452"
    ],
    "aliases": [
      "mettur dam",
      "மேட்டூர்"
    ]
  },
  {
    "id": "loc-attur",
    "name": "Attur",
    "district": "Salem",
    "type": "city",
    "latitude": 11.5975,
    "longitude": 78.6019,
    "pincodes": [
      "636102",
      "636141"
    ],
    "aliases": [
      "aathur",
      "attur salem",
      "ஆத்தூர்"
    ]
  },
  {
    "id": "loc-omalur",
    "name": "Omalur",
    "district": "Salem",
    "type": "taluk",
    "latitude": 11.74,
    "longitude": 78.04,
    "pincodes": [
      "636455"
    ],
    "aliases": [
      "omaalur",
      "ஓமலூர்"
    ]
  },
  {
    "id": "loc-edappadi",
    "name": "Edappadi",
    "district": "Salem",
    "type": "city",
    "latitude": 11.5833,
    "longitude": 77.85,
    "pincodes": [
      "637101"
    ],
    "aliases": [
      "edapadi",
      "idappadi",
      "எடப்பாடி"
    ]
  },
  {
    "id": "loc-sankari",
    "name": "Sankari",
    "district": "Salem",
    "type": "taluk",
    "latitude": 11.485,
    "longitude": 77.8683,
    "pincodes": [
      "637301"
    ],
    "aliases": [
      "sankaridrug",
      "sankaridurg",
      "sankagiri",
      "shankari",
      "சங்ககிரி"
    ]
  },
  {
    "id": "loc-yercaud",
    "name": "Yercaud",
    "district": "Salem",
    "type": "taluk",
    "latitude": 11.78,
    "longitude": 78.21,
    "pincodes": [
      "636601"
    ],
    "aliases": [
      "ஏற்காடு"
    ]
  },
  {
    "id": "loc-vazhapadi",
    "name": "Vazhapadi",
    "district": "Salem",
    "type": "taluk",
    "latitude": 11.66,
    "longitude": 78.4,
    "pincodes": [
      "636115"
    ],
    "aliases": [
      "valapady",
      "valapadi",
      "வாழப்பாடி"
    ]
  },
  {
    "id": "loc-mecheri",
    "name": "Mecheri",
    "district": "Salem",
    "type": "town",
    "latitude": 11.83,
    "longitude": 77.94,
    "pincodes": [
      "636453"
    ],
    "aliases": [
      "மேச்சேரி"
    ]
  },
  {
    "id": "loc-jalakandapuram",
    "name": "Jalakandapuram",
    "district": "Salem",
    "type": "town",
    "latitude": 11.7,
    "longitude": 77.87,
    "pincodes": [
      "636501"
    ],
    "aliases": [
      "ஜலகண்டாபுரம்"
    ]
  },
  {
    "id": "loc-gangavalli",
    "name": "Gangavalli",
    "district": "Salem",
    "type": "taluk",
    "latitude": 11.48,
    "longitude": 78.65,
    "pincodes": [
      "636105"
    ],
    "aliases": [
      "கங்கவல்லி"
    ]
  },
  {
    "id": "loc-thammampatti",
    "name": "Thammampatti",
    "district": "Salem",
    "type": "town",
    "latitude": 11.43,
    "longitude": 78.58,
    "pincodes": [
      "636113"
    ],
    "aliases": [
      "தம்மம்பட்டி"
    ]
  },
  {
    "id": "dist-namakkal",
    "name": "Namakkal",
    "district": "Namakkal",
    "type": "district",
    "latitude": 11.2189,
    "longitude": 78.1674,
    "pincodes": [
      "637001",
      "637002",
      "637003"
    ],
    "aliases": [
      "nmk",
      "namakkal town",
      "poultry city",
      "நாமக்கல்"
    ]
  },
  {
    "id": "loc-tiruchengode",
    "name": "Tiruchengode",
    "district": "Namakkal",
    "type": "city",
    "latitude": 11.3789,
    "longitude": 77.8967,
    "pincodes": [
      "637211",
      "637214",
      "637209"
    ],
    "aliases": [
      "thiruchengode",
      "திருச்செங்கோடு"
    ]
  },
  {
    "id": "loc-rasipuram",
    "name": "Rasipuram",
    "district": "Namakkal",
    "type": "taluk",
    "latitude": 11.4644,
    "longitude": 78.1742,
    "pincodes": [
      "637408"
    ],
    "aliases": [
      "raasipuram",
      "ராசிபுரம்"
    ]
  },
  {
    "id": "loc-paramathi-velur",
    "name": "Paramathi Velur",
    "district": "Namakkal",
    "type": "taluk",
    "latitude": 11.1167,
    "longitude": 78.0167,
    "pincodes": [
      "637207"
    ],
    "aliases": [
      "paramathi",
      "velur",
      "p velur",
      "பரமத்தி வேலூர்"
    ]
  },
  {
    "id": "loc-komarapalayam",
    "name": "Komarapalayam",
    "district": "Namakkal",
    "type": "city",
    "latitude": 11.45,
    "longitude": 77.7167,
    "pincodes": [
      "638183"
    ],
    "aliases": [
      "kumarapalayam",
      "குமாரபாளையம்"
    ]
  },
  {
    "id": "loc-mallasamudram",
    "name": "Mallasamudram",
    "district": "Namakkal",
    "type": "taluk",
    "latitude": 11.4833,
    "longitude": 78.0167,
    "pincodes": [
      "637503"
    ],
    "aliases": [
      "மல்லசமுத்திரம்"
    ]
  },
  {
    "id": "loc-sendamangalam",
    "name": "Sendamangalam",
    "district": "Namakkal",
    "type": "taluk",
    "latitude": 11.29,
    "longitude": 78.24,
    "pincodes": [
      "637409"
    ],
    "aliases": [
      "சேந்தமங்கலம்"
    ]
  },
  {
    "id": "loc-mohanur",
    "name": "Mohanur",
    "district": "Namakkal",
    "type": "taluk",
    "latitude": 11.05,
    "longitude": 78.14,
    "pincodes": [
      "637015"
    ],
    "aliases": [
      "மோகனூர்"
    ]
  },
  {
    "id": "loc-kolli-hills",
    "name": "Kolli Hills",
    "district": "Namakkal",
    "type": "taluk",
    "latitude": 11.25,
    "longitude": 78.34,
    "pincodes": [
      "637411"
    ],
    "aliases": [
      "kolli hills",
      "semmedu",
      "கொல்லிமலை"
    ]
  },
  {
    "id": "dist-erode",
    "name": "Erode",
    "district": "Erode",
    "type": "district",
    "latitude": 11.341,
    "longitude": 77.7172,
    "pincodes": [
      "638001",
      "638002",
      "638003",
      "638009",
      "638011",
      "638012"
    ],
    "aliases": [
      "erd",
      "erodu",
      "erode city",
      "turmeric city",
      "ஈரோடு"
    ]
  },
  {
    "id": "loc-perundurai",
    "name": "Perundurai",
    "district": "Erode",
    "type": "taluk",
    "latitude": 11.2758,
    "longitude": 77.5836,
    "pincodes": [
      "638052"
    ],
    "aliases": [
      "perundhurai",
      "பெருந்துறை"
    ]
  },
  {
    "id": "loc-chennimalai",
    "name": "Chennimalai",
    "district": "Erode",
    "type": "town",
    "latitude": 11.1667,
    "longitude": 77.6167,
    "pincodes": [
      "638051"
    ],
    "aliases": [
      "chenimalai",
      "சென்னிமலை"
    ]
  },
  {
    "id": "loc-bhavani",
    "name": "Bhavani",
    "district": "Erode",
    "type": "taluk",
    "latitude": 11.4489,
    "longitude": 77.6828,
    "pincodes": [
      "638301",
      "638302"
    ],
    "aliases": [
      "bhavani town",
      "பவானி"
    ]
  },
  {
    "id": "loc-gobichettipalayam",
    "name": "Gobichettipalayam",
    "district": "Erode",
    "type": "city",
    "latitude": 11.4542,
    "longitude": 77.4356,
    "pincodes": [
      "638452",
      "638453",
      "638476"
    ],
    "aliases": [
      "gobi",
      "gobichettipalayam town",
      "கோபிசெட்டிபாளையம்",
      "கோபி"
    ]
  },
  {
    "id": "loc-sathyamangalam",
    "name": "Sathyamangalam",
    "district": "Erode",
    "type": "taluk",
    "latitude": 11.5036,
    "longitude": 77.2411,
    "pincodes": [
      "638401",
      "638402"
    ],
    "aliases": [
      "sathy",
      "satyamangalam",
      "சத்தியமங்கலம்",
      "சத்தி"
    ]
  },
  {
    "id": "loc-anthiyur",
    "name": "Anthiyur",
    "district": "Erode",
    "type": "taluk",
    "latitude": 11.58,
    "longitude": 77.58,
    "pincodes": [
      "638501"
    ],
    "aliases": [
      "anthiyoor",
      "அந்தியூர்"
    ]
  },
  {
    "id": "loc-kodumudi",
    "name": "Kodumudi",
    "district": "Erode",
    "type": "taluk",
    "latitude": 11.08,
    "longitude": 77.88,
    "pincodes": [
      "638151"
    ],
    "aliases": [
      "கொடுமுடி"
    ]
  },
  {
    "id": "loc-modakkurichi",
    "name": "Modakkurichi",
    "district": "Erode",
    "type": "taluk",
    "latitude": 11.23,
    "longitude": 77.76,
    "pincodes": [
      "638104"
    ],
    "aliases": [
      "மொடக்குறிச்சி"
    ]
  },
  {
    "id": "dist-madurai",
    "name": "Madurai",
    "district": "Madurai",
    "type": "district",
    "latitude": 9.9252,
    "longitude": 78.1198,
    "pincodes": [
      "625001",
      "625002",
      "625003",
      "625009",
      "625010",
      "625014",
      "625016",
      "625020"
    ],
    "aliases": [
      "mdu",
      "madurei",
      "madura",
      "maduray",
      "madurai city",
      "மதுரை"
    ]
  },
  {
    "id": "loc-thirumangalam",
    "name": "Thirumangalam",
    "district": "Madurai",
    "type": "taluk",
    "latitude": 9.8242,
    "longitude": 77.9892,
    "pincodes": [
      "625706"
    ],
    "aliases": [
      "tirumangalam",
      "திருமங்கலம்"
    ]
  },
  {
    "id": "loc-tkallupatti",
    "name": "T.Kallupatti",
    "district": "Madurai",
    "type": "town",
    "latitude": 9.7214,
    "longitude": 77.7889,
    "pincodes": [
      "625703"
    ],
    "aliases": [
      "kallupatti",
      "t kallupatti",
      "tkallupatti",
      "டி.கல்லுப்பட்டி"
    ]
  },
  {
    "id": "loc-melur",
    "name": "Melur",
    "district": "Madurai",
    "type": "taluk",
    "latitude": 10.05,
    "longitude": 78.33,
    "pincodes": [
      "625106"
    ],
    "aliases": [
      "மேலூர்"
    ]
  },
  {
    "id": "loc-usilampatti",
    "name": "Usilampatti",
    "district": "Madurai",
    "type": "taluk",
    "latitude": 9.97,
    "longitude": 77.79,
    "pincodes": [
      "625532"
    ],
    "aliases": [
      "உசிலம்பட்டி"
    ]
  },
  {
    "id": "loc-vadipatti",
    "name": "Vadipatti",
    "district": "Madurai",
    "type": "taluk",
    "latitude": 10.06,
    "longitude": 77.98,
    "pincodes": [
      "625218"
    ],
    "aliases": [
      "வாடிப்பட்டி"
    ]
  },
  {
    "id": "loc-sholavandan",
    "name": "Sholavandan",
    "district": "Madurai",
    "type": "town",
    "latitude": 10.02,
    "longitude": 78.01,
    "pincodes": [
      "625214"
    ],
    "aliases": [
      "சோழவந்தான்"
    ]
  },
  {
    "id": "loc-peraiyur",
    "name": "Peraiyur",
    "district": "Madurai",
    "type": "taluk",
    "latitude": 9.72,
    "longitude": 77.79,
    "pincodes": [
      "625703"
    ],
    "aliases": [
      "பேரையூர்"
    ]
  },
  {
    "id": "dist-dindigul",
    "name": "Dindigul",
    "district": "Dindigul",
    "type": "district",
    "latitude": 10.3673,
    "longitude": 77.9803,
    "pincodes": [
      "624001",
      "624002",
      "624003",
      "624005"
    ],
    "aliases": [
      "dgl",
      "dindigal",
      "thindukkal",
      "திண்டுக்கல்"
    ]
  },
  {
    "id": "loc-palani",
    "name": "Palani",
    "district": "Dindigul",
    "type": "city",
    "latitude": 10.45,
    "longitude": 77.5167,
    "pincodes": [
      "624601",
      "624602"
    ],
    "aliases": [
      "plni",
      "pazhani",
      "பழனி"
    ]
  },
  {
    "id": "loc-kodaikanal",
    "name": "Kodaikanal",
    "district": "Dindigul",
    "type": "city",
    "latitude": 10.2381,
    "longitude": 77.4892,
    "pincodes": [
      "624101"
    ],
    "aliases": [
      "kodai",
      "கொடைக்கானல்"
    ]
  },
  {
    "id": "loc-oddanchatram",
    "name": "Oddanchatram",
    "district": "Dindigul",
    "type": "taluk",
    "latitude": 10.48,
    "longitude": 77.75,
    "pincodes": [
      "624619"
    ],
    "aliases": [
      "ottanchathiram",
      "ஒட்டன்சத்திரம்"
    ]
  },
  {
    "id": "loc-natham",
    "name": "Natham",
    "district": "Dindigul",
    "type": "taluk",
    "latitude": 10.22,
    "longitude": 78.23,
    "pincodes": [
      "624401"
    ],
    "aliases": [
      "நத்தம்"
    ]
  },
  {
    "id": "loc-nilakottai",
    "name": "Nilakottai",
    "district": "Dindigul",
    "type": "taluk",
    "latitude": 10.16,
    "longitude": 77.86,
    "pincodes": [
      "624208"
    ],
    "aliases": [
      "நிலக்கோட்டை"
    ]
  },
  {
    "id": "loc-batlagundu",
    "name": "Batlagundu",
    "district": "Dindigul",
    "type": "town",
    "latitude": 10.16,
    "longitude": 77.76,
    "pincodes": [
      "624202"
    ],
    "aliases": [
      "vathalagundu",
      "வத்தலகுண்டு"
    ]
  },
  {
    "id": "loc-vedasandur",
    "name": "Vedasandur",
    "district": "Dindigul",
    "type": "taluk",
    "latitude": 10.53,
    "longitude": 77.95,
    "pincodes": [
      "624710"
    ],
    "aliases": [
      "வேடசந்தூர்"
    ]
  },
  {
    "id": "dist-theni",
    "name": "Theni",
    "district": "Theni",
    "type": "district",
    "latitude": 10.0104,
    "longitude": 77.4768,
    "pincodes": [
      "625531",
      "625534"
    ],
    "aliases": [
      "theni allinagaram",
      "தேனி"
    ]
  },
  {
    "id": "loc-periyakulam",
    "name": "Periyakulam",
    "district": "Theni",
    "type": "taluk",
    "latitude": 10.12,
    "longitude": 77.55,
    "pincodes": [
      "625601"
    ],
    "aliases": [
      "பெரியகுளம்"
    ]
  },
  {
    "id": "loc-bodinayakanur",
    "name": "Bodinayakanur",
    "district": "Theni",
    "type": "taluk",
    "latitude": 10.01,
    "longitude": 77.35,
    "pincodes": [
      "625513"
    ],
    "aliases": [
      "bodi",
      "போடிநாயக்கனூர்",
      "போடி"
    ]
  },
  {
    "id": "loc-cumbum",
    "name": "Cumbum",
    "district": "Theni",
    "type": "taluk",
    "latitude": 9.7347,
    "longitude": 77.2986,
    "pincodes": [
      "625516"
    ],
    "aliases": [
      "kambam",
      "cumbum theni",
      "கம்பம்"
    ]
  },
  {
    "id": "loc-uthamapalayam",
    "name": "Uthamapalayam",
    "district": "Theni",
    "type": "taluk",
    "latitude": 9.81,
    "longitude": 77.33,
    "pincodes": [
      "625533"
    ],
    "aliases": [
      "உத்தமபாளையம்"
    ]
  },
  {
    "id": "loc-chinnamanur",
    "name": "Chinnamanur",
    "district": "Theni",
    "type": "town",
    "latitude": 9.84,
    "longitude": 77.38,
    "pincodes": [
      "625515"
    ],
    "aliases": [
      "சின்னமனூர்"
    ]
  },
  {
    "id": "loc-andipatti",
    "name": "Andipatti",
    "district": "Theni",
    "type": "taluk",
    "latitude": 9.99,
    "longitude": 77.62,
    "pincodes": [
      "625512"
    ],
    "aliases": [
      "ஆண்டிபட்டி"
    ]
  },
  {
    "id": "dist-tiruchirappalli",
    "name": "Tiruchirappalli",
    "district": "Tiruchirappalli",
    "type": "district",
    "latitude": 10.7905,
    "longitude": 78.7047,
    "pincodes": [
      "620001",
      "620002",
      "620003",
      "620005",
      "620008",
      "620015",
      "620017",
      "620018",
      "620020",
      "620025"
    ],
    "aliases": [
      "trichy",
      "tiruchi",
      "trichi",
      "tiruchirapalli",
      "tiruchy",
      "திருச்சி",
      "திருச்சிராப்பள்ளி"
    ]
  },
  {
    "id": "loc-srirangam",
    "name": "Srirangam",
    "district": "Tiruchirappalli",
    "type": "hub",
    "latitude": 10.8622,
    "longitude": 78.6947,
    "pincodes": [
      "620006"
    ],
    "aliases": [
      "ஸ்ரீரங்கம்"
    ]
  },
  {
    "id": "loc-manapparai",
    "name": "Manapparai",
    "district": "Tiruchirappalli",
    "type": "taluk",
    "latitude": 10.6075,
    "longitude": 78.4153,
    "pincodes": [
      "621306"
    ],
    "aliases": [
      "மணப்பாறை"
    ]
  },
  {
    "id": "loc-musiri",
    "name": "Musiri",
    "district": "Tiruchirappalli",
    "type": "taluk",
    "latitude": 10.94,
    "longitude": 78.44,
    "pincodes": [
      "621211"
    ],
    "aliases": [
      "முசிறி"
    ]
  },
  {
    "id": "loc-thuraiyur",
    "name": "Thuraiyur",
    "district": "Tiruchirappalli",
    "type": "taluk",
    "latitude": 11.14,
    "longitude": 78.59,
    "pincodes": [
      "621010"
    ],
    "aliases": [
      "துறையூர்"
    ]
  },
  {
    "id": "loc-lalgudi",
    "name": "Lalgudi",
    "district": "Tiruchirappalli",
    "type": "taluk",
    "latitude": 10.87,
    "longitude": 78.82,
    "pincodes": [
      "621601"
    ],
    "aliases": [
      "லால்குடி"
    ]
  },
  {
    "id": "loc-thottiyam",
    "name": "Thottiyam",
    "district": "Tiruchirappalli",
    "type": "taluk",
    "latitude": 11.0,
    "longitude": 78.33,
    "pincodes": [
      "621215"
    ],
    "aliases": [
      "தொட்டியம்"
    ]
  },
  {
    "id": "dist-karur",
    "name": "Karur",
    "district": "Karur",
    "type": "district",
    "latitude": 10.9601,
    "longitude": 78.0766,
    "pincodes": [
      "639001",
      "639002",
      "639004",
      "639008"
    ],
    "aliases": [
      "krr",
      "karoor",
      "கரூர்"
    ]
  },
  {
    "id": "loc-aravakurichi",
    "name": "Aravakurichi",
    "district": "Karur",
    "type": "taluk",
    "latitude": 10.7719,
    "longitude": 77.9103,
    "pincodes": [
      "639201"
    ],
    "aliases": [
      "aravakurichi town",
      "aravakkurichi",
      "அரவக்குறிச்சி"
    ]
  },
  {
    "id": "loc-kulithalai",
    "name": "Kulithalai",
    "district": "Karur",
    "type": "taluk",
    "latitude": 10.93,
    "longitude": 78.42,
    "pincodes": [
      "639107"
    ],
    "aliases": [
      "குளித்தலை"
    ]
  },
  {
    "id": "dist-thanjavur",
    "name": "Thanjavur",
    "district": "Thanjavur",
    "type": "district",
    "latitude": 10.787,
    "longitude": 79.1378,
    "pincodes": [
      "613001",
      "613005",
      "613006",
      "613007",
      "613009"
    ],
    "aliases": [
      "tanjore",
      "thanjai",
      "thanjavaur",
      "தஞ்சாவூர்",
      "தஞ்சை"
    ]
  },
  {
    "id": "loc-kumbakonam",
    "name": "Kumbakonam",
    "district": "Thanjavur",
    "type": "city",
    "latitude": 10.9602,
    "longitude": 79.3845,
    "pincodes": [
      "612001",
      "612002"
    ],
    "aliases": [
      "kudanthai",
      "கும்பகோணம்"
    ]
  },
  {
    "id": "loc-pattukkottai",
    "name": "Pattukkottai",
    "district": "Thanjavur",
    "type": "city",
    "latitude": 10.43,
    "longitude": 79.32,
    "pincodes": [
      "614601",
      "614602"
    ],
    "aliases": [
      "pattukottai",
      "pattukodai",
      "pattuk0dai",
      "பட்டுக்கோட்டை"
    ]
  },
  {
    "id": "loc-papanasam",
    "name": "Papanasam",
    "district": "Thanjavur",
    "type": "taluk",
    "latitude": 10.9257,
    "longitude": 79.2789,
    "pincodes": [
      "614205"
    ],
    "aliases": [
      "papanasam thanjavur",
      "பாபநாசம்"
    ]
  },
  {
    "id": "loc-orathanadu",
    "name": "Orathanadu",
    "district": "Thanjavur",
    "type": "taluk",
    "latitude": 10.63,
    "longitude": 79.25,
    "pincodes": [
      "614625"
    ],
    "aliases": [
      "ஒரத்தநாடு"
    ]
  },
  {
    "id": "loc-thiruvaiyaru",
    "name": "Thiruvaiyaru",
    "district": "Thanjavur",
    "type": "taluk",
    "latitude": 10.88,
    "longitude": 79.1,
    "pincodes": [
      "613204"
    ],
    "aliases": [
      "திருவையாறு"
    ]
  },
  {
    "id": "loc-peravurani",
    "name": "Peravurani",
    "district": "Thanjavur",
    "type": "taluk",
    "latitude": 10.29,
    "longitude": 79.16,
    "pincodes": [
      "614804"
    ],
    "aliases": [
      "பேராவூரணி"
    ]
  },
  {
    "id": "dist-tiruvarur",
    "name": "Tiruvarur",
    "district": "Tiruvarur",
    "type": "district",
    "latitude": 10.7725,
    "longitude": 79.6365,
    "pincodes": [
      "610001",
      "610002"
    ],
    "aliases": [
      "thiruvarur",
      "திருவாரூர்"
    ]
  },
  {
    "id": "loc-mannargudi",
    "name": "Mannargudi",
    "district": "Tiruvarur",
    "type": "city",
    "latitude": 10.6667,
    "longitude": 79.45,
    "pincodes": [
      "614001"
    ],
    "aliases": [
      "மன்னார்குடி"
    ]
  },
  {
    "id": "loc-thiruthuraipoondi",
    "name": "Thiruthuraipoondi",
    "district": "Tiruvarur",
    "type": "taluk",
    "latitude": 10.53,
    "longitude": 79.64,
    "pincodes": [
      "614713"
    ],
    "aliases": [
      "திருத்துறைப்பூண்டி"
    ]
  },
  {
    "id": "dist-nagapattinam",
    "name": "Nagapattinam",
    "district": "Nagapattinam",
    "type": "district",
    "latitude": 10.7672,
    "longitude": 79.8449,
    "pincodes": [
      "611001",
      "611002",
      "611003"
    ],
    "aliases": [
      "nagai",
      "nagapatnam",
      "நாகப்பட்டினம்",
      "நாகை"
    ]
  },
  {
    "id": "loc-velankanni",
    "name": "Velankanni",
    "district": "Nagapattinam",
    "type": "town",
    "latitude": 10.68,
    "longitude": 79.85,
    "pincodes": [
      "611111"
    ],
    "aliases": [
      "வேளாங்கண்ணி"
    ]
  },
  {
    "id": "loc-vedaranyam",
    "name": "Vedaranyam",
    "district": "Nagapattinam",
    "type": "taluk",
    "latitude": 10.3756,
    "longitude": 79.8519,
    "pincodes": [
      "614810"
    ],
    "aliases": [
      "vedaraniam",
      "வேதாரண்யம்"
    ]
  },
  {
    "id": "dist-mayiladuthurai",
    "name": "Mayiladuthurai",
    "district": "Mayiladuthurai",
    "type": "district",
    "latitude": 11.1075,
    "longitude": 79.6524,
    "pincodes": [
      "609001",
      "609003"
    ],
    "aliases": [
      "mayavaram",
      "mayuram",
      "மயிலாடுதுறை"
    ]
  },
  {
    "id": "loc-sirkazhi",
    "name": "Sirkazhi",
    "district": "Mayiladuthurai",
    "type": "taluk",
    "latitude": 11.23,
    "longitude": 79.73,
    "pincodes": [
      "609110"
    ],
    "aliases": [
      "seerkazhi",
      "சீர்காழி"
    ]
  },
  {
    "id": "dist-pudukkottai",
    "name": "Pudukkottai",
    "district": "Pudukkottai",
    "type": "district",
    "latitude": 10.3797,
    "longitude": 78.8208,
    "pincodes": [
      "622001",
      "622002",
      "622003"
    ],
    "aliases": [
      "pudukottai",
      "pudukai",
      "புதுக்கோட்டை"
    ]
  },
  {
    "id": "loc-aranthangi",
    "name": "Aranthangi",
    "district": "Pudukkottai",
    "type": "taluk",
    "latitude": 10.16,
    "longitude": 78.99,
    "pincodes": [
      "614616"
    ],
    "aliases": [
      "அறந்தாங்கி"
    ]
  },
  {
    "id": "loc-embalam",
    "name": "Embalam",
    "district": "Pudukkottai",
    "type": "town",
    "latitude": 10.15,
    "longitude": 78.9167,
    "pincodes": [
      "622204"
    ],
    "aliases": [
      "ஏம்பலம்"
    ]
  },
  {
    "id": "dist-sivaganga",
    "name": "Sivaganga",
    "district": "Sivaganga",
    "type": "district",
    "latitude": 9.8433,
    "longitude": 78.4809,
    "pincodes": [
      "630561",
      "630562"
    ],
    "aliases": [
      "sivagangai",
      "சிவகங்கை"
    ]
  },
  {
    "id": "loc-karaikudi",
    "name": "Karaikudi",
    "district": "Sivaganga",
    "type": "city",
    "latitude": 10.0667,
    "longitude": 78.7833,
    "pincodes": [
      "630001",
      "630002",
      "630003"
    ],
    "aliases": [
      "chettinad",
      "காரைக்குடி"
    ]
  },
  {
    "id": "loc-singampunari",
    "name": "Singampunari",
    "district": "Sivaganga",
    "type": "taluk",
    "latitude": 10.1852,
    "longitude": 78.4328,
    "pincodes": [
      "630502"
    ],
    "aliases": [
      "singampuneri",
      "சிங்கம்புணரி"
    ]
  },
  {
    "id": "loc-devakottai",
    "name": "Devakottai",
    "district": "Sivaganga",
    "type": "taluk",
    "latitude": 9.95,
    "longitude": 78.82,
    "pincodes": [
      "630302"
    ],
    "aliases": [
      "தேவகோட்டை"
    ]
  },
  {
    "id": "dist-virudhunagar",
    "name": "Virudhunagar",
    "district": "Virudhunagar",
    "type": "district",
    "latitude": 9.5872,
    "longitude": 77.9514,
    "pincodes": [
      "626001",
      "626002"
    ],
    "aliases": [
      "virudunagar",
      "விருதுநகர்"
    ]
  },
  {
    "id": "loc-sivakasi",
    "name": "Sivakasi",
    "district": "Virudhunagar",
    "type": "city",
    "latitude": 9.4532,
    "longitude": 77.7978,
    "pincodes": [
      "626123",
      "626124"
    ],
    "aliases": [
      "சிவகாசி"
    ]
  },
  {
    "id": "loc-rajapalayam",
    "name": "Rajapalayam",
    "district": "Virudhunagar",
    "type": "city",
    "latitude": 9.4533,
    "longitude": 77.5533,
    "pincodes": [
      "626117",
      "626108"
    ],
    "aliases": [
      "ராஜபாளையம்"
    ]
  },
  {
    "id": "loc-srivilliputhur",
    "name": "Srivilliputhur",
    "district": "Virudhunagar",
    "type": "taluk",
    "latitude": 9.51,
    "longitude": 77.63,
    "pincodes": [
      "626125"
    ],
    "aliases": [
      "srivilliputtur",
      "ஸ்ரீவில்லிபுத்தூர்"
    ]
  },
  {
    "id": "loc-aruppukkottai",
    "name": "Aruppukkottai",
    "district": "Virudhunagar",
    "type": "taluk",
    "latitude": 9.51,
    "longitude": 78.1,
    "pincodes": [
      "626101"
    ],
    "aliases": [
      "அருப்புக்கோட்டை"
    ]
  },
  {
    "id": "dist-tirunelveli",
    "name": "Tirunelveli",
    "district": "Tirunelveli",
    "type": "district",
    "latitude": 8.7139,
    "longitude": 77.7567,
    "pincodes": [
      "627001",
      "627002",
      "627005",
      "627006",
      "627011",
      "627012"
    ],
    "aliases": [
      "tvl",
      "nellai",
      "thirunelveli",
      "திருநெல்வேலி",
      "நெல்லை"
    ]
  },
  {
    "id": "loc-ambasamudram",
    "name": "Ambasamudram",
    "district": "Tirunelveli",
    "type": "taluk",
    "latitude": 8.7,
    "longitude": 77.45,
    "pincodes": [
      "627401"
    ],
    "aliases": [
      "அம்பாசமுத்திரம்"
    ]
  },
  {
    "id": "loc-nanguneri",
    "name": "Nanguneri",
    "district": "Tirunelveli",
    "type": "taluk",
    "latitude": 8.48,
    "longitude": 77.65,
    "pincodes": [
      "627108"
    ],
    "aliases": [
      "நாங்குநேரி"
    ]
  },
  {
    "id": "loc-radhapuram",
    "name": "Radhapuram",
    "district": "Tirunelveli",
    "type": "taluk",
    "latitude": 8.27,
    "longitude": 77.68,
    "pincodes": [
      "627111"
    ],
    "aliases": [
      "ராதாபுரம்"
    ]
  },
  {
    "id": "dist-tenkasi",
    "name": "Tenkasi",
    "district": "Tenkasi",
    "type": "district",
    "latitude": 8.9594,
    "longitude": 77.3161,
    "pincodes": [
      "627811",
      "627802"
    ],
    "aliases": [
      "thenkasi",
      "தென்காசி"
    ]
  },
  {
    "id": "loc-sankarankovil",
    "name": "Sankarankovil",
    "district": "Tenkasi",
    "type": "city",
    "latitude": 9.1706,
    "longitude": 77.5317,
    "pincodes": [
      "627756"
    ],
    "aliases": [
      "sankarankoil",
      "சங்கரன்கோவில்"
    ]
  },
  {
    "id": "loc-alangulam",
    "name": "Alangulam",
    "district": "Tenkasi",
    "type": "taluk",
    "latitude": 8.8711,
    "longitude": 77.5022,
    "pincodes": [
      "627851"
    ],
    "aliases": [
      "alangklum",
      "ஆலங்குளம்"
    ]
  },
  {
    "id": "loc-kadayanallur",
    "name": "Kadayanallur",
    "district": "Tenkasi",
    "type": "taluk",
    "latitude": 9.07,
    "longitude": 77.34,
    "pincodes": [
      "627751"
    ],
    "aliases": [
      "கடையநல்லூர்"
    ]
  },
  {
    "id": "loc-shenkottai",
    "name": "Shenkottai",
    "district": "Tenkasi",
    "type": "taluk",
    "latitude": 8.98,
    "longitude": 77.25,
    "pincodes": [
      "627809"
    ],
    "aliases": [
      "sengottai",
      "செங்கோட்டை"
    ]
  },
  {
    "id": "dist-thoothukudi",
    "name": "Thoothukudi",
    "district": "Thoothukudi",
    "type": "district",
    "latitude": 8.7642,
    "longitude": 78.1348,
    "pincodes": [
      "628001",
      "628002",
      "628003",
      "628008"
    ],
    "aliases": [
      "tuticorin",
      "tuty",
      "தூத்துக்குடி"
    ]
  },
  {
    "id": "loc-tiruchendur",
    "name": "Tiruchendur",
    "district": "Thoothukudi",
    "type": "city",
    "latitude": 8.4975,
    "longitude": 78.1215,
    "pincodes": [
      "628215"
    ],
    "aliases": [
      "thiruchendur",
      "tiruchendoor",
      "திருச்செந்தூர்"
    ]
  },
  {
    "id": "loc-kovilpatti",
    "name": "Kovilpatti",
    "district": "Thoothukudi",
    "type": "city",
    "latitude": 9.1722,
    "longitude": 77.8683,
    "pincodes": [
      "628501",
      "628502"
    ],
    "aliases": [
      "கோவில்பட்டி"
    ]
  },
  {
    "id": "loc-kanam",
    "name": "Kanam",
    "district": "Thoothukudi",
    "type": "town",
    "latitude": 8.5833,
    "longitude": 78.0833,
    "pincodes": [
      "628201"
    ],
    "aliases": [
      "கானம்"
    ]
  },
  {
    "id": "dist-kanyakumari",
    "name": "Nagercoil",
    "district": "Kanyakumari",
    "type": "district",
    "latitude": 8.1833,
    "longitude": 77.4119,
    "pincodes": [
      "629001",
      "629002",
      "629004"
    ],
    "aliases": [
      "ngl",
      "kanyakumari",
      "cape comorin",
      "நாகர்கோவில்",
      "கன்னியாகுமரி"
    ]
  },
  {
    "id": "loc-marthandam",
    "name": "Marthandam",
    "district": "Kanyakumari",
    "type": "town",
    "latitude": 8.3,
    "longitude": 77.22,
    "pincodes": [
      "629165"
    ],
    "aliases": [
      "மார்த்தாண்டம்"
    ]
  },
  {
    "id": "dist-cuddalore",
    "name": "Cuddalore",
    "district": "Cuddalore",
    "type": "district",
    "latitude": 11.748,
    "longitude": 79.7714,
    "pincodes": [
      "607001",
      "607002",
      "607003"
    ],
    "aliases": [
      "koodalur",
      "கடலூர்"
    ]
  },
  {
    "id": "loc-panruti",
    "name": "Panruti",
    "district": "Cuddalore",
    "type": "taluk",
    "latitude": 11.77,
    "longitude": 79.55,
    "pincodes": [
      "607106"
    ],
    "aliases": [
      "பண்ருட்டி"
    ]
  },
  {
    "id": "loc-chidambaram",
    "name": "Chidambaram",
    "district": "Cuddalore",
    "type": "city",
    "latitude": 11.3992,
    "longitude": 79.6936,
    "pincodes": [
      "608001",
      "608002"
    ],
    "aliases": [
      "thillai",
      "சிதம்பரம்"
    ]
  },
  {
    "id": "loc-neyveli",
    "name": "Neyveli",
    "district": "Cuddalore",
    "type": "city",
    "latitude": 11.6006,
    "longitude": 79.4864,
    "pincodes": [
      "607801",
      "607802",
      "607803"
    ],
    "aliases": [
      "nlc",
      "நெய்வேலி"
    ]
  },
  {
    "id": "loc-vridhachalam",
    "name": "Vridhachalam",
    "district": "Cuddalore",
    "type": "taluk",
    "latitude": 11.52,
    "longitude": 79.33,
    "pincodes": [
      "606001"
    ],
    "aliases": [
      "virudhachalam",
      "விருத்தாசலம்"
    ]
  },
  {
    "id": "loc-tittagudi",
    "name": "Tittagudi",
    "district": "Cuddalore",
    "type": "taluk",
    "latitude": 11.4116,
    "longitude": 79.1242,
    "pincodes": [
      "606106"
    ],
    "aliases": [
      "thittakudi",
      "thittakuti",
      "திட்டக்குடி"
    ]
  },
  {
    "id": "dist-viluppuram",
    "name": "Viluppuram",
    "district": "Viluppuram",
    "type": "district",
    "latitude": 11.9401,
    "longitude": 79.4861,
    "pincodes": [
      "605601",
      "605602"
    ],
    "aliases": [
      "villupuram",
      "விழுப்புரம்"
    ]
  },
  {
    "id": "loc-tindivanam",
    "name": "Tindivanam",
    "district": "Viluppuram",
    "type": "taluk",
    "latitude": 12.23,
    "longitude": 79.65,
    "pincodes": [
      "604001"
    ],
    "aliases": [
      "திண்டிவனம்"
    ]
  },
  {
    "id": "dist-kallakurichi",
    "name": "Kallakurichi",
    "district": "Kallakurichi",
    "type": "district",
    "latitude": 11.7383,
    "longitude": 78.9639,
    "pincodes": [
      "606202",
      "606206"
    ],
    "aliases": [
      "கள்ளக்குறிச்சி"
    ]
  },
  {
    "id": "loc-ulundurpet",
    "name": "Ulundurpet",
    "district": "Kallakurichi",
    "type": "taluk",
    "latitude": 11.69,
    "longitude": 79.29,
    "pincodes": [
      "606107"
    ],
    "aliases": [
      "உளுந்தூர்பேட்டை"
    ]
  },
  {
    "id": "loc-semmanangur",
    "name": "Semmanangur",
    "district": "Kallakurichi",
    "type": "town",
    "latitude": 11.6667,
    "longitude": 79.1167,
    "pincodes": [
      "606201"
    ],
    "aliases": [
      "செம்மணங்கூர்"
    ]
  },
  {
    "id": "dist-vellore",
    "name": "Vellore",
    "district": "Vellore",
    "type": "district",
    "latitude": 12.9165,
    "longitude": 79.1325,
    "pincodes": [
      "632001",
      "632002",
      "632004",
      "632006",
      "632009",
      "632014"
    ],
    "aliases": [
      "vlr",
      "vellor",
      "velur",
      "வேலூர்"
    ]
  },
  {
    "id": "loc-katpadi",
    "name": "Katpadi",
    "district": "Vellore",
    "type": "taluk",
    "latitude": 12.98,
    "longitude": 79.14,
    "pincodes": [
      "632007"
    ],
    "aliases": [
      "காட்பாடி"
    ]
  },
  {
    "id": "dist-ranipet",
    "name": "Ranipet",
    "district": "Ranipet",
    "type": "district",
    "latitude": 12.9272,
    "longitude": 79.3331,
    "pincodes": [
      "632401",
      "632402",
      "632403"
    ],
    "aliases": [
      "ranipettai",
      "ராணிப்பேட்டை"
    ]
  },
  {
    "id": "loc-arakkonam",
    "name": "Arakkonam",
    "district": "Ranipet",
    "type": "taluk",
    "latitude": 13.08,
    "longitude": 79.67,
    "pincodes": [
      "631001",
      "631002"
    ],
    "aliases": [
      "arokkonam",
      "அரக்கோணம்"
    ]
  },
  {
    "id": "dist-tirupathur",
    "name": "Tirupathur",
    "district": "Tirupathur",
    "type": "district",
    "latitude": 12.4958,
    "longitude": 78.5678,
    "pincodes": [
      "635601",
      "635602"
    ],
    "aliases": [
      "tirupattur",
      "திருப்பத்தூர்"
    ]
  },
  {
    "id": "loc-ambur",
    "name": "Ambur",
    "district": "Tirupathur",
    "type": "city",
    "latitude": 12.7906,
    "longitude": 78.7161,
    "pincodes": [
      "635802"
    ],
    "aliases": [
      "ஆம்பூர்"
    ]
  },
  {
    "id": "loc-vaniyambadi",
    "name": "Vaniyambadi",
    "district": "Tirupathur",
    "type": "city",
    "latitude": 12.6828,
    "longitude": 78.6186,
    "pincodes": [
      "635751"
    ],
    "aliases": [
      "வாணியம்பாடி"
    ]
  },
  {
    "id": "dist-tiruvannamalai",
    "name": "Tiruvannamalai",
    "district": "Tiruvannamalai",
    "type": "district",
    "latitude": 12.2253,
    "longitude": 79.0747,
    "pincodes": [
      "606601",
      "606602",
      "606604"
    ],
    "aliases": [
      "thiruvannamalai",
      "திருவண்ணாமலை"
    ]
  },
  {
    "id": "loc-arani",
    "name": "Arani",
    "district": "Tiruvannamalai",
    "type": "taluk",
    "latitude": 12.67,
    "longitude": 79.28,
    "pincodes": [
      "632301"
    ],
    "aliases": [
      "ஆரணி"
    ]
  },
  {
    "id": "loc-chetpet-tvm",
    "name": "Chetpet",
    "district": "Tiruvannamalai",
    "type": "taluk",
    "latitude": 12.47,
    "longitude": 79.35,
    "pincodes": [
      "606801"
    ],
    "aliases": [
      "சேத்துப்பட்டு திருவண்ணாமலை"
    ]
  },
  {
    "id": "dist-kanchipuram",
    "name": "Kanchipuram",
    "district": "Kanchipuram",
    "type": "district",
    "latitude": 12.8342,
    "longitude": 79.7036,
    "pincodes": [
      "631501",
      "631502",
      "631503"
    ],
    "aliases": [
      "kanchi",
      "kancheepuram",
      "காஞ்சிபுரம்",
      "காஞ்சி"
    ]
  },
  {
    "id": "loc-sriperumbudur",
    "name": "Sriperumbudur",
    "district": "Kanchipuram",
    "type": "hub",
    "latitude": 12.9694,
    "longitude": 79.9439,
    "pincodes": [
      "602105"
    ],
    "aliases": [
      "ஸ்ரீபெரும்புதூர்"
    ]
  },
  {
    "id": "dist-chengalpattu",
    "name": "Chengalpattu",
    "district": "Chengalpattu",
    "type": "district",
    "latitude": 12.6841,
    "longitude": 79.9836,
    "pincodes": [
      "603001",
      "603002",
      "603003"
    ],
    "aliases": [
      "chengleput",
      "செங்கல்பட்டு"
    ]
  },
  {
    "id": "loc-tambaram",
    "name": "Tambaram",
    "district": "Chengalpattu",
    "type": "hub",
    "latitude": 12.9249,
    "longitude": 80.1,
    "pincodes": [
      "600045",
      "600059"
    ],
    "aliases": [
      "தாம்பரம்"
    ]
  },
  {
    "id": "loc-madurantakam",
    "name": "Madurantakam",
    "district": "Chengalpattu",
    "type": "taluk",
    "latitude": 12.5086,
    "longitude": 79.8833,
    "pincodes": [
      "603306"
    ],
    "aliases": [
      "maduranthakam",
      "மதுராந்தகம்"
    ]
  },
  {
    "id": "dist-tiruvallur",
    "name": "Tiruvallur",
    "district": "Tiruvallur",
    "type": "district",
    "latitude": 13.1432,
    "longitude": 79.9083,
    "pincodes": [
      "602001",
      "602002"
    ],
    "aliases": [
      "thiruvallur",
      "திருவள்ளூர்"
    ]
  },
  {
    "id": "loc-avadi",
    "name": "Avadi",
    "district": "Tiruvallur",
    "type": "city",
    "latitude": 13.1147,
    "longitude": 80.1018,
    "pincodes": [
      "600054",
      "600071"
    ],
    "aliases": [
      "ஆவடி"
    ]
  },
  {
    "id": "loc-poonamallee",
    "name": "Poonamallee",
    "district": "Tiruvallur",
    "type": "hub",
    "latitude": 13.0489,
    "longitude": 80.0936,
    "pincodes": [
      "600056"
    ],
    "aliases": [
      "பூந்தமல்லி"
    ]
  },
  {
    "id": "dist-dharmapuri",
    "name": "Dharmapuri",
    "district": "Dharmapuri",
    "type": "district",
    "latitude": 12.1211,
    "longitude": 78.1582,
    "pincodes": [
      "636701",
      "636702",
      "636703"
    ],
    "aliases": [
      "dpi",
      "தர்மபுரி"
    ]
  },
  {
    "id": "loc-harur",
    "name": "Harur",
    "district": "Dharmapuri",
    "type": "taluk",
    "latitude": 12.06,
    "longitude": 78.5,
    "pincodes": [
      "636903"
    ],
    "aliases": [
      "அரூர்"
    ]
  },
  {
    "id": "loc-pennagaram",
    "name": "Pennagaram",
    "district": "Dharmapuri",
    "type": "taluk",
    "latitude": 12.1311,
    "longitude": 77.8931,
    "pincodes": [
      "636810"
    ],
    "aliases": [
      "பென்னாகரம்"
    ]
  },
  {
    "id": "dist-krishnagiri",
    "name": "Krishnagiri",
    "district": "Krishnagiri",
    "type": "district",
    "latitude": 12.5186,
    "longitude": 78.2137,
    "pincodes": [
      "635001",
      "635002"
    ],
    "aliases": [
      "கிருஷ்ணகிரி"
    ]
  },
  {
    "id": "loc-hosur",
    "name": "Hosur",
    "district": "Krishnagiri",
    "type": "city",
    "latitude": 12.7409,
    "longitude": 77.8253,
    "pincodes": [
      "635109",
      "635110",
      "635126"
    ],
    "aliases": [
      "hsr",
      "hosoor",
      "ஓசூர்",
      "ஹோசூர்"
    ]
  },
  {
    "id": "dist-ariyalur",
    "name": "Ariyalur",
    "district": "Ariyalur",
    "type": "district",
    "latitude": 11.1401,
    "longitude": 79.0786,
    "pincodes": [
      "621704",
      "621713"
    ],
    "aliases": [
      "அரியலூர்"
    ]
  },
  {
    "id": "dist-perambalur",
    "name": "Perambalur",
    "district": "Perambalur",
    "type": "district",
    "latitude": 11.2333,
    "longitude": 78.8833,
    "pincodes": [
      "621212",
      "621220"
    ],
    "aliases": [
      "பெரம்பலூர்"
    ]
  },
  {
    "id": "dist-ramanathapuram",
    "name": "Ramanathapuram",
    "district": "Ramanathapuram",
    "type": "district",
    "latitude": 9.3639,
    "longitude": 78.8395,
    "pincodes": [
      "623501",
      "623502",
      "623503"
    ],
    "aliases": [
      "ramnad",
      "இராமநாதபுரம்",
      "ராமநாதபுரம்"
    ]
  },
  {
    "id": "loc-rameswaram",
    "name": "Rameswaram",
    "district": "Ramanathapuram",
    "type": "town",
    "latitude": 9.28,
    "longitude": 79.3,
    "pincodes": [
      "623526"
    ],
    "aliases": [
      "ராமேஸ்வரம்"
    ]
  },
  {
    "id": "dist-puducherry",
    "name": "Puducherry",
    "district": "Puducherry",
    "type": "district",
    "latitude": 11.9416,
    "longitude": 79.8083,
    "pincodes": [
      "605001",
      "605002",
      "605003",
      "605004",
      "605009"
    ],
    "aliases": [
      "pondicherry",
      "pondy",
      "பாண்டிச்சேரி",
      "புதுச்சேரி"
    ]
  }
];

/**
 * Normalizes an arbitrary search key:
 * 1. Converts stylized unicode & Greek/Cyrillic homoglyphs to standard ASCII
 * 2. Applies Unicode NFKD decomposition
 * 3. Corrects embedded OCR / typo digits (0 -> o, 1 -> i, 5 -> s)
 * 4. Preserves Tamil characters (஀-௿) and alphanumeric tokens (a-z0-9)
 */
export function normalizeKey(str: string): string {
  if (!str) return '';

  // 1. Substitute homoglyphs / lookalikes
  let s = '';
  for (const ch of str) {
    s += UNICODE_LOOKALIKES[ch] || ch;
  }

  // 2. Unicode NFKD normalization
  s = s.normalize('NFKD').toLowerCase();

  // 3. Typo / OCR digit corrections inside words
  s = s
    .replace(/([a-z])0([a-z])/g, '$1o$2')
    .replace(/0([a-z])/g, 'o$1')
    .replace(/([a-z])0/g, '$1o')
    .replace(/([a-z])1([a-z])/g, '$1i$2')
    .replace(/([a-z])5([a-z])/g, '$1s$2');

  // 4. Retain only alphanumeric and Tamil characters
  return s.replace(/[^a-z0-9\u0B80-\u0BFF]/g, '').trim();
}

// ==========================================
// Pre-computed O(1) Index Maps
// ==========================================
export const PINCODE_INDEX = new Map<string, LocationNode>();
export const EXACT_INDEX = new Map<string, LocationNode>();
export const ALIAS_INDEX = new Map<string, LocationNode>();

for (const loc of TN_LOCATIONS) {
  // 1. Exact Name index
  const exactKey = normalizeKey(loc.name);
  if (exactKey && !EXACT_INDEX.has(exactKey)) {
    EXACT_INDEX.set(exactKey, loc);
  }

  // 2. Pincode index
  if (loc.pincodes) {
    for (const pin of loc.pincodes) {
      if (!PINCODE_INDEX.has(pin)) {
        PINCODE_INDEX.set(pin, loc);
      }
    }
  }

  // 3. Alias index
  if (loc.aliases) {
    for (const alias of loc.aliases) {
      const aliasKey = normalizeKey(alias);
      if (aliasKey && !ALIAS_INDEX.has(aliasKey)) {
        ALIAS_INDEX.set(aliasKey, loc);
      }
    }
  }
}
