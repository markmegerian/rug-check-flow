export interface Client {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  pricingTier: "standard" | "preferred" | "vip";
  rugCount: number;
  outstandingBalance: number;
}

export const MOCK_CLIENTS: Client[] = [
  {
    id: "client-1",
    name: "Riverside Interior Design",
    contactName: "Sarah Chen",
    phone: "(555) 234-5678",
    email: "sarah@riversideinteriors.com",
    address: "1200 River Rd, Suite 4, Portland OR 97201",
    notes: "Preferred pickup on Tuesdays",
    pricingTier: "preferred",
    rugCount: 24,
    outstandingBalance: 1250.0,
  },
  {
    id: "client-2",
    name: "Grandma's Estate Sales",
    contactName: "Tom Whitfield",
    phone: "(555) 345-6789",
    email: "tom@grandmasestates.com",
    address: "88 Oak St, Portland OR 97204",
    notes: "Often brings antique rugs, handle with care",
    pricingTier: "standard",
    rugCount: 8,
    outstandingBalance: 430.0,
  },
  {
    id: "client-3",
    name: "Pacific Rug Gallery",
    contactName: "Amir Farouk",
    phone: "(555) 456-7890",
    email: "amir@pacificrugs.com",
    address: "3300 NW 23rd Ave, Portland OR 97210",
    notes: "VIP — high volume, net-30 terms",
    pricingTier: "vip",
    rugCount: 67,
    outstandingBalance: 4800.0,
  },
  {
    id: "client-4",
    name: "HomeStage PDX",
    contactName: "Lisa Tran",
    phone: "(555) 567-8901",
    email: "lisa@homestagepdx.com",
    address: "450 SE Division St, Portland OR 97202",
    notes: "",
    pricingTier: "standard",
    rugCount: 12,
    outstandingBalance: 0,
  },
  {
    id: "client-5",
    name: "Bella Casa Furnishings",
    contactName: "Marco Reyes",
    phone: "(555) 678-9012",
    email: "marco@bellacasa.com",
    address: "7100 SW Macadam Ave, Portland OR 97219",
    notes: "Prefers email communication only",
    pricingTier: "preferred",
    rugCount: 31,
    outstandingBalance: 2100.0,
  },
];
