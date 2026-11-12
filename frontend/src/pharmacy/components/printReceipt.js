export function printReceiptElement(element, billId) {
  if (!element) return;
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Pharmacy Receipt — ${billId || ""}</title>
        <style>
          body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; margin: 2rem; color: #17343b; }
          .pharmacy-receipt-container { max-width: 680px; margin: 0 auto; }
          .pharmacy-receipt-header { border-bottom: 2px solid #0f8b8d; padding-bottom: 1rem; margin-bottom: 1.25rem; text-align: center; }
          .pharmacy-receipt-header h2 { font-size: 1.4rem; font-weight: bold; margin-bottom: 0.25rem; color: #0f8b8d; }
          .pharmacy-receipt-header .small { font-size: 0.85rem; color: #6c7c80; }
          .pharmacy-receipt-unpaid-notice { background-color: #fff3cd; color: #664d03; border: 1px solid #ffe69c; padding: 0.5rem 1rem; border-radius: 0.375rem; font-weight: 600; text-align: center; margin-bottom: 1.25rem; }
          .pharmacy-receipt-meta { display: flex; justify-content: space-between; margin-bottom: 1.25rem; font-size: 0.9rem; }
          .pharmacy-receipt-meta .col-6 { width: 48%; }
          .text-secondary { color: #6c7c80; }
          .text-end { text-align: right; }
          .text-center { text-align: center; }
          .text-success { color: #198754; }
          .text-warning { color: #ffc107; }
          .text-primary { color: #0f8b8d; }
          .table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
          .table th, .table td { padding: 0.5rem 0.25rem; border-bottom: 1px solid #dee2e6; font-size: 0.9rem; }
          .table tfoot th, .table tfoot td { border-bottom: none; }
          .fw-bold { font-weight: bold; }
          .fs-6 { font-size: 1rem; }
          .pharmacy-receipt-footer { border-top: 1px solid #dce7e7; padding-top: 1rem; margin-top: 1.5rem; text-align: center; font-size: 0.85rem; color: #6c7c80; }
          @media print { body { margin: 1rem; } }
        </style>
      </head>
      <body>
        ${element.innerHTML}
      </body>
    </html>
  `);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }, 1000);
    }
  }, 300);
}
