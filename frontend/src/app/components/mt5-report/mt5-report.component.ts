import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

interface TradeReport {
  contractName: string;
  enteredAt: string;
  exitedAt: string;
  entryPrice: string;
  exitPrice: string;
  fees: string;
  pnl: string;
  size: string;
  type: string;
  tradeDay: string;
  tradeDuration: string;
  commissions: string;
  swap?: string;
  symbol: string;
}

interface AccountReport {
  accountId: string;
  accountName: string;
  broker: string;
  currency: string;
  balance: number;
  report: TradeReport[];
}

type SortColumn = keyof TradeReport;
type SortDirection = 'asc' | 'desc' | null;

@Component({
  selector: 'app-mt5-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mt5-report.component.html',
  styleUrls: ['./mt5-report.component.css']
})
export class MT5ReportComponent {
  startDate: string = '';
  endDate: string = '';
  maxDate: string = new Date().toISOString().split('T')[0];
  
  isLoading = false;
  isConnected = false;
  connectionStatus = 'Disconnected';
  errorMessage = '';
  wasGenerated = false;
  
  accountReports: AccountReport[] = [];
  selectedAccountIndex = 0;
  selectedAccount: AccountReport | null = null;
  totalPnL = 0;

  // Sorting
  sortColumn: SortColumn | null = null;
  sortDirection: SortDirection = null;
  sortedReport: TradeReport[] = [];

  constructor(private http: HttpClient) {
    this.initializeDates();
  }

  initializeDates() {
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    
    this.endDate = today.toISOString().split('T')[0];
    this.startDate = lastMonth.toISOString().split('T')[0];
  }

  generateReport() {
    this.isLoading = true;
    this.errorMessage = '';
    this.wasGenerated = false;
    
    this.http.post<any>('http://localhost:3010/api/mt5-reports', {
      startDate: this.startDate,
      endDate: this.endDate
    }).subscribe({
      next: (response) => {
        this.isLoading = false;
        this.wasGenerated = true;
        
        if (response.success) {
          this.accountReports = response.data;
          if (this.accountReports.length > 0) {
            this.selectAccount(0);
          }
          this.isConnected = true;
          this.connectionStatus = 'Connected';
        } else {
          this.errorMessage = response.error || 'Failed to generate report';
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.wasGenerated = true;
        this.errorMessage = error.message || 'Error connecting to server';
        console.error('Report generation error:', error);
      }
    });
  }

  selectAccount(index: number) {
    this.selectedAccountIndex = index;
    this.selectedAccount = this.accountReports[index];
    this.sortColumn = null;
    this.sortDirection = null;
    this.sortedReport = [...this.selectedAccount.report];
    this.calculateTotalPnL();
  }

  sortBy(column: SortColumn) {
    if (this.sortColumn === column) {
      // Cycle through: asc -> desc -> null
      if (this.sortDirection === 'asc') {
        this.sortDirection = 'desc';
      } else if (this.sortDirection === 'desc') {
        this.sortDirection = null;
        this.sortColumn = null;
        this.sortedReport = [...(this.selectedAccount?.report || [])];
        return;
      }
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }

    this.applySorting();
  }

  applySorting() {
    if (!this.selectedAccount || !this.sortColumn || !this.sortDirection) {
      return;
    }

    this.sortedReport = [...this.selectedAccount.report].sort((a, b) => {
      const column = this.sortColumn!;
      let aVal: any = a[column];
      let bVal: any = b[column];

      // Handle numeric columns
      if (['entryPrice', 'exitPrice', 'fees', 'pnl', 'size', 'commissions'].includes(column)) {
        aVal = parseFloat(aVal) || 0;
        bVal = parseFloat(bVal) || 0;
      }
      
      // Handle date columns
      if (['enteredAt', 'exitedAt', 'tradeDay'].includes(column)) {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      // Handle duration (convert to seconds for comparison)
      if (column === 'tradeDuration') {
        aVal = this.parseDuration(aVal);
        bVal = this.parseDuration(bVal);
      }

      // Compare
      if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }

  parseDuration(duration: string): number {
    // Convert duration string to seconds for sorting
    // Format examples: "2h 15m 30s", "45m 20s", "30s", "1d 5h 20m"
    let seconds = 0;
    const dayMatch = duration.match(/(\d+)d/);
    const hourMatch = duration.match(/(\d+)h/);
    const minMatch = duration.match(/(\d+)m/);
    const secMatch = duration.match(/(\d+)s/);
    
    if (dayMatch) seconds += parseInt(dayMatch[1]) * 86400;
    if (hourMatch) seconds += parseInt(hourMatch[1]) * 3600;
    if (minMatch) seconds += parseInt(minMatch[1]) * 60;
    if (secMatch) seconds += parseInt(secMatch[1]);
    
    return seconds;
  }

  getSortIcon(column: SortColumn): string {
    if (this.sortColumn !== column) return '';
    return this.sortDirection === 'asc' ? '▲' : '▼';
  }

  isSortedBy(column: SortColumn): boolean {
    return this.sortColumn === column;
  }

  calculateTotalPnL() {
    if (!this.selectedAccount) {
      this.totalPnL = 0;
      return;
    }
    
    this.totalPnL = this.selectedAccount.report.reduce((sum, trade) => {
      return sum + this.getPnLValue(trade.pnl);
    }, 0);
  }

  getPnLValue(value: string | number): number {
    if (typeof value === 'number') return value;
    return parseFloat(value) || 0;
  }

  formatCurrency(value: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(value);
  }

  exportToCSV() {
    if (!this.selectedAccount) return;
    
    const headers = [
      'Contract Name', 'Entered At', 'Exited At', 
      'Entry Price', 'Exit Price', 'Size', 'Type',
      'Fees', 'Commission', 'P&L', 'Duration'
    ];
    
    const dataToExport = this.sortedReport.length > 0 ? this.sortedReport : this.selectedAccount.report;
    
    const rows = dataToExport.map(trade => [
      trade.contractName,
      trade.enteredAt,
      trade.exitedAt,
      trade.entryPrice,
      trade.exitPrice,
      trade.size,
      trade.type,
      trade.fees,
      trade.commissions,
      trade.pnl,
      trade.tradeDuration
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mt5-report-${this.selectedAccount.accountName}-${this.startDate}-${this.endDate}.csv`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  exportToJSON() {
    if (!this.selectedAccount) return;
    
    const dataToExport = this.sortedReport.length > 0 ? this.sortedReport : this.selectedAccount.report;
    const jsonContent = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mt5-report-${this.selectedAccount.accountName}-${this.startDate}-${this.endDate}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }
}