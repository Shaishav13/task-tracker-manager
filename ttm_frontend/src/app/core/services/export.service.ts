import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ExportService {

  /**
   * Export JSON array to CSV file
   */
  exportToCsv(filename: string, rows: Record<string, any>[]): void {
    if (!rows || !rows.length) {
      console.warn('No data available to export');
      return;
    }

    const headers = Object.keys(rows[0]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        headers.map(header => {
          let val = row[header] ?? '';
          if (typeof val === 'object') {
            val = JSON.stringify(val);
          }
          // Escape quotes and commas for valid CSV formatting
          const escaped = String(val).replace(/"/g, '""');
          return `"${escaped}"`;
        }).join(',')
      )
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Export styled report to PDF via print view
   */
  exportToPdf(title: string, headers: string[], rows: (string | number)[][]): void {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) {
      alert('Pop-up blocked. Please allow pop-ups to generate PDF report.');
      return;
    }

    const headerHtml = headers.map(h => `<th>${h}</th>`).join('');
    const rowsHtml = rows.map(r => `<tr>${r.map(cell => `<td>${cell ?? ''}</td>`).join('')}</tr>`).join('');

    const content = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title} - Executive Report</title>
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #1e293b; background: #ffffff; }
          h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 5px; }
          p.subtitle { font-size: 13px; color: #64748b; margin-bottom: 25px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #f1f5f9; text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 600; color: #334155; border-bottom: 2px solid #cbd5e1; }
          td { padding: 10px 12px; font-size: 12px; border-bottom: 1px solid #e2e8f0; }
          tr:nth-child(even) { background: #f8fafc; }
          .footer { margin-top: 40px; font-size: 11px; color: #94a3b8; text-align: right; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p class="subtitle">Task Tracker Manager System Performance Analytics Report — Generated ${new Date().toLocaleString()}</p>
        <table>
          <thead>
            <tr>${headerHtml}</tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="footer">Confidential — Enterprise Internal Report</div>
        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(content);
    printWindow.document.close();
  }
}
