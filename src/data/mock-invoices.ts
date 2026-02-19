export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";

export interface InvoiceLineItem {
  rugNumber: string;
  services: string[];
  subtotal: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string;
  clientName: string;
  date: string;
  rugCount: number;
  totalAmount: number;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  notes: string;
}

export const MOCK_INVOICES: Invoice[] = [
  {
    id: "inv-1",
    invoiceNumber: "INV-2026-001",
    clientId: "client-3",
    clientName: "Pacific Rug Gallery",
    date: "2026-02-15",
    rugCount: 5,
    totalAmount: 2340.0,
    status: "sent",
    lineItems: [
      { rugNumber: "RB-1001", services: ["Deep Wash", "Scotchgard"], subtotal: 520.0 },
      { rugNumber: "RB-1002", services: ["Standard Wash"], subtotal: 280.0 },
      { rugNumber: "RB-1003", services: ["Deep Wash", "Moth Proofing"], subtotal: 490.0 },
      { rugNumber: "RB-1004", services: ["Standard Wash", "Fringe Repair"], subtotal: 525.0 },
      { rugNumber: "RB-1005", services: ["Silk Treatment"], subtotal: 525.0 },
    ],
    notes: "Net-30 terms per VIP agreement",
  },
  {
    id: "inv-2",
    invoiceNumber: "INV-2026-002",
    clientId: "client-1",
    clientName: "Riverside Interior Design",
    date: "2026-02-12",
    rugCount: 3,
    totalAmount: 890.0,
    status: "paid",
    lineItems: [
      { rugNumber: "RB-0998", services: ["Standard Wash", "Scotchgard"], subtotal: 330.0 },
      { rugNumber: "RB-0999", services: ["Pet Stain Treatment"], subtotal: 280.0 },
      { rugNumber: "RB-1000", services: ["Standard Wash"], subtotal: 280.0 },
    ],
    notes: "",
  },
  {
    id: "inv-3",
    invoiceNumber: "INV-2026-003",
    clientId: "client-2",
    clientName: "Grandma's Estate Sales",
    date: "2026-01-28",
    rugCount: 2,
    totalAmount: 1650.0,
    status: "overdue",
    lineItems: [
      { rugNumber: "RB-0990", services: ["Antique Restoration"], subtotal: 960.0 },
      { rugNumber: "RB-0991", services: ["Silk Treatment", "Moth Proofing"], subtotal: 690.0 },
    ],
    notes: "Follow up — 3 weeks past due",
  },
  {
    id: "inv-4",
    invoiceNumber: "INV-2026-004",
    clientId: "client-5",
    clientName: "Bella Casa Furnishings",
    date: "2026-02-18",
    rugCount: 4,
    totalAmount: 1420.0,
    status: "draft",
    lineItems: [
      { rugNumber: "RB-1010", services: ["Deep Wash"], subtotal: 400.0 },
      { rugNumber: "RB-1011", services: ["Standard Wash", "Edge Binding"], subtotal: 338.0 },
      { rugNumber: "RB-1012", services: ["Standard Wash"], subtotal: 280.0 },
      { rugNumber: "RB-1013", services: ["Deep Wash", "Scotchgard"], subtotal: 402.0 },
    ],
    notes: "Awaiting final measurements on RB-1012",
  },
  {
    id: "inv-5",
    invoiceNumber: "INV-2026-005",
    clientId: "client-4",
    clientName: "HomeStage PDX",
    date: "2026-02-10",
    rugCount: 2,
    totalAmount: 560.0,
    status: "paid",
    lineItems: [
      { rugNumber: "RB-0995", services: ["Standard Wash"], subtotal: 280.0 },
      { rugNumber: "RB-0996", services: ["Standard Wash"], subtotal: 280.0 },
    ],
    notes: "",
  },
];
