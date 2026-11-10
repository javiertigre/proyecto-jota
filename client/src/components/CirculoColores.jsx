import React, { useState, useEffect, useRef, useMemo } from 'react';

// Paleta de colores vivos y festivos para los sectores de la ruleta
const PALETA_COLORES = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef', '#ec4899',
  '#14b8a6', '#84cc16', '#eab308', '#2563eb', '#9333ea',
  '#f43f5e', '#059669', '#0284c7', '#7c3aed', '#db2777'
];

export default function CirculoColores({
  onCerrar,
  dinamicaInicial,
  listaDinamicas = [],
  valoresDinamicas = [],
  desglosarTickets,
  onCambiarEstadoTicket
}) {
  // Dinámica seleccionada: inicia con la dinámica activa actual
  const [dinamicaSel, setDinamicaSel] = useState(() => {
    if (dinamicaInicial) return dinamicaInicial;
    if (valoresDinamicas && valoresDinamicas.length > 0) return valoresDinamicas[0].nombre;
    return '';
  });

  const [soloPendientes, setSoloPendientes] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [girando, setGirando] = useState(false);
  const [ganador, setGanador] = useState(null);
  const [historialGanadores, setHistorialGanadores] = useState([]);

  // Referencias para animación y canvas
  const canvasRef = useRef(null);
  const anguloRef = useRef(0);
  const animacionRef = useRef(null);
  const audioCtxRef = useRef(null);
  const ultimoSectorTickRef = useRef(-1);

  // Obtener los tickets desglosados según la dinámica seleccionada y el filtro
  const tickets = useMemo(() => {
    let items = listaDinamicas || [];
    if (dinamicaSel) {
      items = items.filter((x) => String(x.dinamica_nombre || '').trim().toLowerCase() === String(dinamicaSel).trim().toLowerCase());
    }
    if (soloPendientes) {
      items = items.filter((x) => (x.ticket_entregado || 'Pendiente') !== 'Entregado');
    }

    const desglosados = desglosarTickets ? desglosarTickets(items) : [];

    // Ordenar por número ascendente
    desglosados.sort((a, b) => (Number(a.numero) || 0) - (Number(b.numero) || 0));

    // Asignar colores cíclicos
    return desglosados.map((t, idx) => ({
      ...t,
      color: PALETA_COLORES[idx % PALETA_COLORES.length]
    }));
  }, [listaDinamicas, dinamicaSel, soloPendientes, desglosarTickets]);

  const totalTickets = tickets.length;

  // Sonidos con Web Audio API (100% nativo sin dependencias externas)
  const reproducirTick = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtxRef.current = new AudioContext();
      }
      if (!audioCtxRef.current) return;
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(550, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.035);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch { }
  };

  const reproducirFanfarria = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtxRef.current = new AudioContext();
      }
      if (!audioCtxRef.current) return;
      if (audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      const ctx = audioCtxRef.current;
      const notas = [523.25, 659.25, 783.99, 1046.50]; // Do5, Mi5, Sol5, Do6
      notas.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        const tiempoInicio = ctx.currentTime + i * 0.11;
        osc.frequency.setValueAtTime(freq, tiempoInicio);
        gain.gain.setValueAtTime(0.2, tiempoInicio);
        gain.gain.exponentialRampToValueAtTime(0.001, tiempoInicio + 0.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(tiempoInicio);
        osc.stop(tiempoInicio + 0.45);
      });
    } catch { }
  };

  // Función para dibujar la ruleta en el Canvas
  const dibujarRuleta = (anguloActual) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ancho = canvas.width;
    const alto = canvas.height;
    const cx = ancho / 2;
    const cy = alto / 2;
    const radio = Math.min(cx, cy) - 24;

    ctx.clearRect(0, 0, ancho, alto);

    if (totalTickets === 0) {
      // Estado sin boletos
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.arc(cx, cy, radio, 0, 2 * Math.PI);
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin números registrados', cx, cy - 10);
      ctx.font = '13px sans-serif';
      ctx.fillText('en esta dinámica', cx, cy + 14);
      return;
    }

    const arcoSector = (2 * Math.PI) / totalTickets;

    // Sombra exterior de la ruleta
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, radio + 10, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.restore();

    // Aro exterior decorativo dorado
    ctx.beginPath();
    ctx.arc(cx, cy, radio + 10, 0, 2 * Math.PI);
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    // Dibujar cada sector de la ruleta
    for (let i = 0; i < totalTickets; i++) {
      const ticket = tickets[i];
      const anguloInicio = anguloActual + i * arcoSector;
      const anguloFin = anguloInicio + arcoSector;

      // Sector coloreado
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radio, anguloInicio, anguloFin);
      ctx.closePath();
      ctx.fillStyle = ticket.color;
      ctx.fill();

      // Borde del sector
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Número en el sector
      ctx.save();
      ctx.translate(cx, cy);
      const anguloMedio = anguloInicio + arcoSector / 2;
      ctx.rotate(anguloMedio);

      // Posición del texto radial
      const distTexto = radio * 0.72;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      // Ajustar tamaño de fuente según cantidad de sectores
      let tamFuente = 16;
      if (totalTickets > 60) tamFuente = 10;
      else if (totalTickets > 40) tamFuente = 12;
      else if (totalTickets > 25) tamFuente = 14;

      ctx.font = `bold ${tamFuente}px "Segoe UI", Roboto, sans-serif`;

      // Sombra para contraste del texto
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#ffffff';

      const textoNum = '#' + (ticket.numero != null ? ticket.numero : ticket.numeroTexto);
      ctx.fillText(textoNum, distTexto, 0);

      // Si hay espacio y pocos sectores, mostrar nombre abreviado
      if (totalTickets <= 18) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#fef08a';
        const primerNombre = String(ticket.cliente || '').split(/\s+/)[0] || '';
        const nombreCorto = primerNombre.length > 9 ? primerNombre.slice(0, 8) + '…' : primerNombre;
        ctx.fillText(nombreCorto, distTexto - 30, 0);
      }

      ctx.restore();
    }

    // Luces/remaches decorativos alrededor del aro exterior
    const numLuces = Math.min(36, Math.max(16, totalTickets));
    for (let l = 0; l < numLuces; l++) {
      const angLuz = (l * 2 * Math.PI) / numLuces;
      const lx = cx + Math.cos(angLuz) * (radio + 5);
      const ly = cy + Math.sin(angLuz) * (radio + 5);
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, 2 * Math.PI);
      ctx.fillStyle = l % 2 === 0 ? '#fef08a' : '#ffffff';
      ctx.fill();
    }

    // Centro de la ruleta (buje metálico)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, 2 * Math.PI);
    ctx.fillStyle = '#1e293b';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, 32, 0, 2 * Math.PI);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    // Ícono en el centro
    ctx.fillStyle = '#ffffff';
    ctx.font = '22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯', cx, cy);

    // Flecha indicadora superior (apunta hacia abajo, al sector ganador)
    const puntaY = cy - radio + 10;
    const baseFlechaY = puntaY - 26;
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    ctx.moveTo(cx, puntaY);
    ctx.lineTo(cx - 15, baseFlechaY);
    ctx.lineTo(cx + 15, baseFlechaY);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, baseFlechaY - 2, 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  // Redibujar cuando cambian los tickets
  useEffect(() => {
    dibujarRuleta(anguloRef.current);
  }, [tickets]);

  // Limpiar animación al desmontar
  useEffect(() => {
    return () => {
      if (animacionRef.current) cancelAnimationFrame(animacionRef.current);
    };
  }, []);

  // Calcular qué ticket queda bajo la flecha superior (a -Math.PI / 2)
  const obtenerIndiceBajoFlecha = (angulo) => {
    if (totalTickets === 0) return -1;
    const arcoSector = (2 * Math.PI) / totalTickets;
    // La flecha está arriba en 3 * PI / 2 (equivalente a -PI / 2)
    const anguloFlecha = (3 * Math.PI) / 2;
    let relativo = (anguloFlecha - angulo) % (2 * Math.PI);
    if (relativo < 0) relativo += 2 * Math.PI;
    const indice = Math.floor(relativo / arcoSector) % totalTickets;
    return indice;
  };

  // Girar la ruleta
  const girar = () => {
    if (girando || totalTickets === 0) return;

    setGirando(true);
    setGanador(null);

    const duracion = 5500; // 5.5 segundos de rotación
    const vueltasCompletas = 6 + Math.floor(Math.random() * 4); // entre 6 y 9 vueltas
    const anguloAleatorio = Math.random() * (2 * Math.PI);
    const anguloInicial = anguloRef.current % (2 * Math.PI);
    const distanciaGiro = vueltasCompletas * (2 * Math.PI) + anguloAleatorio;
    const tiempoInicio = performance.now();

    ultimoSectorTickRef.current = -1;

    // Función de desaceleración suave (ease-out cúbico)
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3.5);

    const frame = (ahora) => {
      const transcurrido = ahora - tiempoInicio;
      const progreso = Math.min(1, transcurrido / duracion);
      const factorSuavizado = easeOutCubic(progreso);

      const anguloActual = anguloInicial + distanciaGiro * factorSuavizado;
      anguloRef.current = anguloActual;
      dibujarRuleta(anguloActual);

      // Reproducir sonido de tick cuando cambia de sector
      const sectorActual = obtenerIndiceBajoFlecha(anguloActual);
      if (sectorActual !== ultimoSectorTickRef.current) {
        ultimoSectorTickRef.current = sectorActual;
        reproducirTick();
      }

      if (progreso < 1) {
        animacionRef.current = requestAnimationFrame(frame);
      } else {
        // Giro completado: determinar ganador exacto
        setGirando(false);
        const indiceGanador = obtenerIndiceBajoFlecha(anguloActual);
        const elegido = tickets[indiceGanador];
        if (elegido) {
          setGanador(elegido);
          setHistorialGanadores((prev) => [
            { ...elegido, hora: new Date().toLocaleTimeString() },
            ...prev
          ]);
          reproducirFanfarria();
        }
      }
    };

    animacionRef.current = requestAnimationFrame(frame);
  };

  // Filtrado de la tabla de participantes
  const ticketsFiltrados = tickets.filter((t) => {
    if (!busqueda.trim()) return true;
    const q = busqueda.toLowerCase().trim();
    return (
      String(t.numero).includes(q) ||
      String(t.numeroTexto).includes(q) ||
      String(t.cliente || '').toLowerCase().includes(q) ||
      String(t.celular || '').includes(q)
    );
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !girando) onCerrar();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '1020px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}
      >
        {/* Cabecera del modal */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#ffffff',
            padding: '16px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '3px solid #f59e0b'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '28px' }}>🎡</span>
            <div>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 800, letterSpacing: '-0.5px' }}>
                Círculo de Colores — CAPRIJOTA
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#cbd5e1' }}>
                Sorteo oficial e interactivo con los números registrados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            disabled={girando}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '24px',
              cursor: girando ? 'not-allowed' : 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
              lineHeight: 1
            }}
            title="Cerrar ventana"
          >
            ✕
          </button>
        </div>

        {/* Barra superior de controles: Selección de Dinámica y Filtro */}
        <div
          style={{
            background: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
              🎯 Dinámica:
            </label>
            <select
              value={dinamicaSel}
              onChange={(e) => {
                setDinamicaSel(e.target.value);
                setGanador(null);
              }}
              disabled={girando}
              style={{
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                background: '#ffffff',
                color: '#0f172a',
                cursor: 'pointer'
              }}
            >
              <option value="">-- Todas las Dinámicas --</option>
              {valoresDinamicas.map((v) => (
                <option key={v.id} value={v.nombre}>
                  {v.nombre} (Bs {Number(v.valor).toFixed(2)})
                </option>
              ))}
            </select>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '13px',
                fontWeight: 600,
                color: '#475569',
                marginLeft: 12,
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={soloPendientes}
                onChange={(e) => {
                  setSoloPendientes(e.target.checked);
                  setGanador(null);
                }}
                disabled={girando}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              Solo boletos en estado ⏳ Pendiente
            </label>
          </div>

          <div
            style={{
              fontSize: '13px',
              fontWeight: 700,
              color: '#047857',
              background: '#d1fae5',
              padding: '6px 14px',
              borderRadius: '20px',
              border: '1px solid #a7f3d0'
            }}
          >
            🎟️ {totalTickets} números participantes en el Circulo de Colores
          </div>
        </div>

        {/* Cuerpo principal con Ruleta + Panel de Ganador y Participantes */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(340px, 490px) 1fr',
            gap: 20,
            padding: '20px',
            overflowY: 'auto',
            alignItems: 'start'
          }}
        >
          {/* COLUMNA IZQUIERDA: CANVAS RULETA Y BOTÓN GIRAR */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              background: '#f8fafc',
              padding: '16px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ position: 'relative', width: 440, height: 440, maxWidth: '100%' }}>
              <canvas
                ref={canvasRef}
                width={440}
                height={440}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  borderRadius: '50%'
                }}
              />
            </div>

            {/* Botón principal para girar */}
            <button
              type="button"
              onClick={girar}
              disabled={girando || totalTickets === 0}
              style={{
                marginTop: 16,
                width: '100%',
                maxWidth: '360px',
                padding: '14px 20px',
                fontSize: '16px',
                fontWeight: 800,
                color: '#ffffff',
                background: girando
                  ? '#94a3b8'
                  : 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)',
                border: 'none',
                borderRadius: '10px',
                cursor: girando || totalTickets === 0 ? 'not-allowed' : 'pointer',
                boxShadow: girando ? 'none' : '0 4px 14px rgba(234, 88, 12, 0.45)',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                letterSpacing: '0.5px'
              }}
            >
              <span style={{ fontSize: '20px' }}>{girando ? '⏳' : '🎲'}</span>
              {girando
                ? '¡GIRANDO EL CIRCULO DE COLORES...!'
                : totalTickets === 0
                  ? 'No hay números para girar'
                  : '¡GIRAR EL CIRCULO DE COLORES!'}
            </button>
          </div>

          {/* COLUMNA DERECHA: TARJETA DE GANADOR Y LISTA DE PARTICIPANTES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Tarjeta del ganador si existe */}
            {ganador ? (
              <div
                style={{
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  border: '2px solid #f59e0b',
                  borderRadius: '14px',
                  padding: '16px 20px',
                  boxShadow: '0 8px 20px rgba(245, 158, 11, 0.25)',
                  animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                  <span style={{ fontSize: '36px' }}>🏆</span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase' }}>
                      ¡Tenemos un Ganador!
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: '#92400e' }}>
                      Boleto #{ganador.numero != null ? ganador.numero : ganador.numeroTexto}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '10px',
                    padding: '12px 14px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: 10,
                    fontSize: '13px',
                    border: '1px solid #fcd34d'
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', display: 'block', fontWeight: 700 }}>
                      👤 CLIENTE
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '14px' }}>
                      {ganador.cliente || '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', display: 'block', fontWeight: 700 }}>
                      📱 CELULAR
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '14px' }}>
                      {ganador.celular || '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', display: 'block', fontWeight: 700 }}>
                      🎯 DINÁMICA
                    </span>
                    <strong style={{ color: '#047857', fontSize: '13px' }}>
                      {ganador.dinamica || 'Dinámica'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '11px', display: 'block', fontWeight: 700 }}>
                      📦 ESTADO
                    </span>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 700,
                        background: ganador.ticket_entregado === 'Entregado' ? '#dcfce7' : '#fef3c7',
                        color: ganador.ticket_entregado === 'Entregado' ? '#15803d' : '#b45309'
                      }}
                    >
                      {ganador.ticket_entregado === 'Entregado' ? '✅ Entregado' : '⏳ Pendiente'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={girar}
                    disabled={girando}
                    style={{
                      background: '#0f172a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 14px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🎲 Girar de nuevo
                  </button>

                  {onCambiarEstadoTicket && ganador.ticket_entregado !== 'Entregado' && (
                    <button
                      type="button"
                      onClick={() => {
                        onCambiarEstadoTicket(ganador, 'Entregado');
                        setGanador((prev) => ({ ...prev, ticket_entregado: 'Entregado' }));
                      }}
                      style={{
                        background: '#16a34a',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        padding: '7px 14px',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      ✓ Marcar premio como Entregado
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: '12px',
                  padding: '16px',
                  textAlign: 'center',
                  color: '#64748b'
                }}
              >
                <span style={{ fontSize: '28px', display: 'block', marginBottom: 6 }}>🎯</span>
                <strong style={{ color: '#334155', fontSize: '14px' }}>
                  Listo para el sorteo
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                  Haz clic en <strong>"¡GIRAR CIRCULO DE COLORES!"</strong> para iniciar la animación y seleccionar al azar un número ganador.
                </p>
              </div>
            )}

            {/* TABLA DE NÚMEROS PARTICIPANTES */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                flex: 1
              }}
            >
              <div
                style={{
                  background: '#f1f5f9',
                  padding: '10px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #e2e8f0',
                  gap: 8,
                  flexWrap: 'wrap'
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '13px', color: '#1e293b' }}>
                  📋 Lista de Números en el Circulo de Colores ({tickets.length})
                </span>
                <input
                  type="text"
                  placeholder="🔍 Buscar número o cliente..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{
                    padding: '5px 10px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    width: '180px'
                  }}
                />
              </div>

              <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                {ticketsFiltrados.length === 0 ? (
                  <p style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', margin: 0 }}>
                    {totalTickets === 0
                      ? 'No hay números registrados para esta dinámica.'
                      : 'No se encontraron números con esa búsqueda.'}
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '6px 10px', width: '50px' }}>Color</th>
                        <th style={{ padding: '6px 10px', width: '60px' }}>N°</th>
                        <th style={{ padding: '6px 10px' }}>Cliente</th>
                        <th style={{ padding: '6px 10px' }}>Celular</th>
                        <th style={{ padding: '6px 10px' }}>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticketsFiltrados.map((t, idx) => {
                        const esElGanador = ganador && Number(ganador.numero) === Number(t.numero);
                        return (
                          <tr
                            key={t.id + '-' + t.numero + '-' + idx}
                            style={{
                              borderBottom: '1px solid #f1f5f9',
                              background: esElGanador ? '#fef3c7' : idx % 2 === 0 ? '#ffffff' : '#fafafa',
                              fontWeight: esElGanador ? 700 : 'normal',
                              color: esElGanador ? '#92400e' : '#1e293b'
                            }}
                          >
                            <td style={{ padding: '6px 10px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '14px',
                                  height: '14px',
                                  borderRadius: '50%',
                                  background: t.color,
                                  verticalAlign: 'middle',
                                  border: '1px solid rgba(0,0,0,0.15)'
                                }}
                              />
                            </td>
                            <td style={{ padding: '6px 10px', fontWeight: 700 }}>
                              #{t.numero != null ? t.numero : t.numeroTexto}
                            </td>
                            <td style={{ padding: '6px 10px' }}>{t.cliente}</td>
                            <td style={{ padding: '6px 10px' }}>{t.celular}</td>
                            <td style={{ padding: '6px 10px' }}>
                              <span
                                style={{
                                  padding: '2px 6px',
                                  borderRadius: '8px',
                                  fontSize: '10px',
                                  fontWeight: 700,
                                  background: (t.ticket_entregado || 'Pendiente') === 'Entregado' ? '#dcfce7' : '#fef3c7',
                                  color: (t.ticket_entregado || 'Pendiente') === 'Entregado' ? '#15803d' : '#b45309'
                                }}
                              >
                                {t.ticket_entregado === 'Entregado' ? 'Entregado' : 'Pendiente'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Historial de ganadores si hay más de uno */}
            {historialGanadores.length > 1 && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '10px 14px'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>
                  📜 HISTORIAL DE GIROS EN ESTA SESIÓN:
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {historialGanadores.map((h, i) => (
                    <span
                      key={i}
                      style={{
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '12px',
                        padding: '2px 8px',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: '#334155'
                      }}
                    >
                      #{h.numero} ({h.cliente.split(' ')[0]}) <small style={{ color: '#94a3b8' }}>{h.hora}</small>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

