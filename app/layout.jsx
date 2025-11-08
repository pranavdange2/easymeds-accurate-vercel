export const metadata = { title: "EasyMeds Accurate | Compare Prices" };
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Inter, system-ui, sans-serif', margin: 0, padding: 24, background:'#0b0c10', color:'#eaf0f6' }}>
        <div style={{maxWidth:900, margin:'0 auto'}}>{children}</div>
      </body>
    </html>
  );
}
