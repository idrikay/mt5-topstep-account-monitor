export interface Trade {
  id: number | string;
  accountId: number | string;
  // Field names differ between platforms
  contractId?: string;   // TopStepX
  symbol?: string;       // MT5
  creationTimestamp?: string;  // TopStepX
  time?: string;               // MT5
  price: number;
  profitAndLoss?: number;  // TopStepX
  profit?: number;         // MT5
  fees?: number;           // TopStepX
  commission?: number;     // MT5
  swap?: number;           // MT5
  side?: number;
  type?: string;
  size?: number;           // TopStepX
  volume?: number;         // MT5
  voided?: boolean;
  orderId?: number | string;
}