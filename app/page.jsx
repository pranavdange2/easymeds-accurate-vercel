"use client";
import { useState } from "react";

export default function Page() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  async function go() {
    setLoading(true); setError(""); setData(null);
    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicine: q })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setData(json);
    } catch(e) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  return (
    <main>
      <h1 style={{fontSize:32, marginBottom:8}}>Accurate Medicine Price Compare</h1>
      <p style={{opacity:.8, marginTop:0}}>No external backend. Per-site extractors + validation.</p>

      <div style={{display:'flex', gap:8, marginTop:12}}>
        <input
          value={q}
          onChange={e=>setQ(e.target.value)}
          placeholder="Try: paracetamol 500 mg tablet"
          style={{flex:1, padding:14, borderRadius:12, border:'1px solid #2b2f36', background:'#15181d', color:'#eaf0f6'}}
        />
        <button onClick={go} disabled={loading || !q.trim()} style={{padding:'14px 18px', borderRadius:12, border:'1px solid #2b2f36', background:'#1f6feb', color:'white', cursor:'pointer'}}>
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {error && <p style={{color:'#ff6b6b', marginTop:12}}>⚠ {error}</p>}

      {data && (
        <section style={{marginTop:24}}>
          {data.count > 0 ? (
            <>
              <h2 style={{marginTop:0}}>Best price: ₹{data.bestPrice}</h2>
              {data.savings != null && (
                <p>You save ₹{data.savings.toFixed(2)} (~{data.savingsPercentage.toFixed(1)}%).</p>
              )}
              <ul style={{listStyle:'none', padding:0, marginTop:16}}>
                {data.results.map((r,i)=>(
                  <li key={i} style={{padding:14, border:'1px solid #2b2f36', background:'#0f1217', borderRadius:12, marginBottom:10}}>
                    <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
                      <div style={{fontWeight:700}}>{r.medicine} — {r.pharmacy}</div>
                      <div>Match: {(r.score*100).toFixed(0)}%</div>
                    </div>
                    <div>₹{r.price} · <a href={r.url} target="_blank" rel="noreferrer">View</a></div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No results found. Try refining your query (e.g., add strength and form like “500 mg tablet”).</p>
          )}
        </section>
      )}
    </main>
  );
}
