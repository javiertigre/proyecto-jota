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
  const [mostrarModalGanador, setMostrarModalGanador] = useState(false);
  const [historialGanadores, setHistorialGanadores] = useState([]);

  // Detectar ancho de pantalla para diseño 100% responsivo en celulares
  const [anchoPantalla, setAnchoPantalla] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 500
  );

  useEffect(() => {
    const alRedimensionar = () => setAnchoPantalla(window.innerWidth);
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);

  const esMovil = anchoPantalla < 768;
  // Diámetro dinámico para que en celulares nunca se corte ni desborde
  const diametroRuleta = Math.min(430, Math.max(260, esMovil ? anchoPantalla - 48 : 420));

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
      items = items.filter((x) =>
        String(x.dinamica_nombre || '').trim().toLowerCase() === String(dinamicaSel).trim().toLowerCase()
      );
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
    } catch {}
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
        gain.gain.setValueAtTime(0.25, tiempoInicio);
        gain.gain.exponentialRampToValueAtTime(0.001, tiempoInicio + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(tiempoInicio);
        osc.stop(tiempoInicio + 0.5);
      });
    } catch {}
  };

  // Función para dibujar la ruleta en el Canvas (escala dinámica con diametroRuleta)
  const dibujarRuleta = (anguloActual) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const ancho = canvas.width;
    const alto = canvas.height;
    const cx = ancho / 2;
    const cy = alto / 2;
    const margenExterior = esMovil ? 16 : 22;
    const radio = Math.min(cx, cy) - margenExterior;

    ctx.clearRect(0, 0, ancho, alto);

    if (totalTickets === 0) {
      // Estado sin boletos
      ctx.fillStyle = '#f1f5f9';
      ctx.beginPath();
      ctx.arc(cx, cy, radio, 0, 2 * Math.PI);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#cbd5e1';
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Sin números registrados', cx, cy - 8);
      ctx.font = '12px sans-serif';
      ctx.fillText('en esta dinámica', cx, cy + 12);
      return;
    }

    const arcoSector = (2 * Math.PI) / totalTickets;

    // Sombra exterior de la ruleta
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = esMovil ? 12 : 18;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, radio + 8, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.restore();

    // Aro exterior decorativo dorado
    ctx.beginPath();
    ctx.arc(cx, cy, radio + 8, 0, 2 * Math.PI);
    ctx.lineWidth = esMovil ? 6 : 8;
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
      ctx.lineWidth = 1.5;
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

      // Ajustar tamaño de fuente según cantidad de sectores y resolución móvil
      const factorEscala = radio / 190;
      let tamFuente = Math.round(15 * factorEscala);
      if (totalTickets > 60) tamFuente = Math.round(9 * factorEscala);
      else if (totalTickets > 40) tamFuente = Math.round(11 * factorEscala);
      else if (totalTickets > 25) tamFuente = Math.round(13 * factorEscala);

      ctx.font = `bold ${Math.max(8, tamFuente)}px "Segoe UI", Roboto, sans-serif`;

      // Sombra para contraste del texto
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 3;
      ctx.fillStyle = '#ffffff';

      const textoNum = '#' + (ticket.numero != null ? ticket.numero : ticket.numeroTexto);
      ctx.fillText(textoNum, distTexto, 0);

      // Si hay espacio y pocos sectores, mostrar nombre abreviado
      if (totalTickets <= 16 && !esMovil) {
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#fef08a';
        const primerNombre = String(ticket.cliente || '').split(/\s+/)[0] || '';
        const nombreCorto = primerNombre.length > 8 ? primerNombre.slice(0, 7) + '…' : primerNombre;
        ctx.fillText(nombreCorto, distTexto - 26, 0);
      }

      ctx.restore();
    }

    // Luces/remaches decorativos alrededor del aro exterior
    const numLuces = Math.min(32, Math.max(14, totalTickets));
    for (let l = 0; l < numLuces; l++) {
      const angLuz = (l * 2 * Math.PI) / numLuces;
      const lx = cx + Math.cos(angLuz) * (radio + 4);
      const ly = cy + Math.sin(angLuz) * (radio + 4);
      ctx.beginPath();
      ctx.arc(lx, ly, esMovil ? 2.5 : 3, 0, 2 * Math.PI);
      ctx.fillStyle = l % 2 === 0 ? '#fef08a' : '#ffffff';
      ctx.fill();
    }

    // Centro de la ruleta (buje metálico)
    const radioBuje = Math.max(22, Math.round(radio * 0.16));
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, radioBuje, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, radioBuje, 0, 2 * Math.PI);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();

    // Ícono en el centro
    ctx.fillStyle = '#ffffff';
    ctx.font = `${Math.round(radioBuje * 0.85)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🎯', cx, cy);

    // Flecha indicadora superior (apunta hacia abajo, al sector ganador)
    const puntaY = cy - radio + (esMovil ? 8 : 10);
    const tamFlecha = esMovil ? 20 : 26;
    const baseFlechaY = puntaY - tamFlecha;
    const anchoFlechaMitad = esMovil ? 11 : 14;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    ctx.moveTo(cx, puntaY);
    ctx.lineTo(cx - anchoFlechaMitad, baseFlechaY);
    ctx.lineTo(cx + anchoFlechaMitad, baseFlechaY);
    ctx.closePath();
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, baseFlechaY - 2, esMovil ? 5 : 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#dc2626';
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };

  // Redibujar cuando cambian los tickets o el tamaño
  useEffect(() => {
    dibujarRuleta(anguloRef.current);
  }, [tickets, diametroRuleta]);

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
    setMostrarModalGanador(false);

    const duracion = 5400; // 5.4 segundos de rotación
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

      // Sonido de tick al pasar por cada sector
      const sectorActual = obtenerIndiceBajoFlecha(anguloActual);
      if (sectorActual !== ultimoSectorTickRef.current) {
        ultimoSectorTickRef.current = sectorActual;
        reproducirTick();
      }

      if (progreso < 1) {
        animacionRef.current = requestAnimationFrame(frame);
      } else {
        // Giro completado: proclamar ganador
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
          // MOSTRAR POPUP/MODAL CELEBRATORIO DE GANADOR INMEDIATAMENTE
          setMostrarModalGanador(true);
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
        backgroundColor: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(5px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: esMovil ? '6px' : '16px',
        overflowY: 'auto'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !girando) onCerrar();
      }}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: esMovil ? '12px' : '16px',
          width: '100%',
          maxWidth: '1040px',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          position: 'relative'
        }}
      >
        {/* Marca de agua de fondo con el logotipo en todo el modal */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'url(/JC.jpeg)',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundSize: esMovil ? '260px' : '420px',
            opacity: 0.05,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />

        {/* Cabecera del modal con Logotipo */}
        <div
          style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            color: '#ffffff',
            padding: esMovil ? '10px 14px' : '14px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '3px solid #f59e0b',
            flexShrink: 0,
            position: 'relative',
            zIndex: 2
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <img
              src="/JC.jpeg"
              alt="Logotipo JC"
              style={{
                width: esMovil ? '36px' : '46px',
                height: esMovil ? '36px' : '46px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid #f59e0b',
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
                flexShrink: 0
              }}
            />
            <div>
              <h2 style={{ margin: 0, fontSize: esMovil ? '16px' : '20px', fontWeight: 800 }}>
                Círculo de Colores — JC Capricornio
              </h2>
              <p style={{ margin: 0, fontSize: esMovil ? '11px' : '12px', color: '#cbd5e1' }}>
                Sorteo oficial e interactivo con los números registrados
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCerrar}
            disabled={girando}
            style={{
              background: '#334155',
              border: 'none',
              color: '#ffffff',
              fontSize: '18px',
              cursor: girando ? 'not-allowed' : 'pointer',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
            padding: esMovil ? '10px 12px' : '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: esMovil ? '100%' : 'auto' }}>
            <label style={{ fontSize: '13px', fontWeight: 700, color: '#334155' }}>
              🎯 Dinámica:
            </label>
            <select
              value={dinamicaSel}
              onChange={(e) => {
                setDinamicaSel(e.target.value);
                setGanador(null);
                setMostrarModalGanador(false);
              }}
              disabled={girando}
              style={{
                padding: '6px 10px',
                borderRadius: '8px',
                border: '1.5px solid #cbd5e1',
                fontSize: '13px',
                fontWeight: 600,
                background: '#ffffff',
                color: '#0f172a',
                cursor: 'pointer',
                flex: esMovil ? 1 : 'none'
              }}
            >
              <option value="">-- Todas las Dinámicas --</option>
              {valoresDinamicas.map((v) => (
                <option key={v.id} value={v.nombre}>
                  {v.nombre} (Bs {Number(v.valor).toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', width: esMovil ? '100%' : 'auto', justifyContent: 'space-between' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '12px',
                fontWeight: 600,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={soloPendientes}
                onChange={(e) => {
                  setSoloPendientes(e.target.checked);
                  setGanador(null);
                  setMostrarModalGanador(false);
                }}
                disabled={girando}
                style={{ width: 15, height: 15, cursor: 'pointer' }}
              />
              Solo boletos ⏳ Pendientes
            </label>

            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: '#047857',
                background: '#d1fae5',
                padding: '4px 10px',
                borderRadius: '16px',
                border: '1px solid #a7f3d0'
              }}
            >
              🎟️ {totalTickets} en la ruleta
            </div>
          </div>
        </div>

        {/* Cuerpo principal con Ruleta + Panel de Ganador y Participantes */}
        <div
          style={{
            display: esMovil ? 'flex' : 'grid',
            flexDirection: esMovil ? 'column' : 'initial',
            gridTemplateColumns: esMovil ? 'none' : 'minmax(320px, 450px) 1fr',
            gap: esMovil ? 14 : 20,
            padding: esMovil ? '12px' : '20px',
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
              padding: esMovil ? '10px' : '16px',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              width: '100%',
              boxSizing: 'border-box'
            }}
          >
            {/* Contenedor del Canvas perfectamente centrado y responsivo */}
            <div
              style={{
                position: 'relative',
                width: diametroRuleta,
                height: diametroRuleta,
                maxWidth: '100%',
                margin: '0 auto'
              }}
            >
              <canvas
                ref={canvasRef}
                width={diametroRuleta}
                height={diametroRuleta}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'block',
                  borderRadius: '50%'
                }}
              />

              {/* Logotipo circular en el centro de la ruleta */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: Math.max(46, Math.round(diametroRuleta * 0.17)),
                  height: Math.max(46, Math.round(diametroRuleta * 0.17)),
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid #f59e0b',
                  boxShadow: '0 3px 10px rgba(0,0,0,0.45)',
                  pointerEvents: 'none',
                  zIndex: 3,
                  background: '#0f172a'
                }}
              >
                <img
                  src="/JC.jpeg"
                  alt="Logo Central"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            </div>

            {/* Botón principal para girar */}
            <button
              type="button"
              onClick={girar}
              disabled={girando || totalTickets === 0}
              style={{
                marginTop: 14,
                width: '100%',
                maxWidth: '380px',
                padding: esMovil ? '12px 16px' : '14px 20px',
                fontSize: esMovil ? '15px' : '16px',
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
                ? '¡GIRANDO EL CÍRCULO...!'
                : totalTickets === 0
                ? 'No hay números para girar'
                : '¡GIRAR RULETA DE COLORES!'}
            </button>
          </div>

          {/* COLUMNA DERECHA: TARJETA DE GANADOR Y LISTA DE PARTICIPANTES */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: '100%' }}>
            {/* Tarjeta del ganador si existe */}
            {ganador ? (
              <div
                style={{
                  background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                  border: '2px solid #f59e0b',
                  borderRadius: '14px',
                  padding: esMovil ? '14px' : '16px 20px',
                  boxShadow: '0 8px 20px rgba(245, 158, 11, 0.25)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: '32px' }}>🏆</span>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase' }}>
                      ¡Tenemos un Ganador!
                    </div>
                    <div style={{ fontSize: esMovil ? '20px' : '24px', fontWeight: 900, color: '#92400e' }}>
                      Boleto #{ganador.numero != null ? ganador.numero : ganador.numeroTexto}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: '#ffffff',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                    gap: 8,
                    fontSize: '13px',
                    border: '1px solid #fcd34d'
                  }}
                >
                  <div>
                    <span style={{ color: '#64748b', fontSize: '10px', display: 'block', fontWeight: 700 }}>
                      👤 CLIENTE
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '14px' }}>
                      {ganador.cliente || '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '10px', display: 'block', fontWeight: 700 }}>
                      📱 CELULAR
                    </span>
                    <strong style={{ color: '#0f172a', fontSize: '14px' }}>
                      {ganador.celular || '—'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '10px', display: 'block', fontWeight: 700 }}>
                      🎯 DINÁMICA
                    </span>
                    <strong style={{ color: '#047857', fontSize: '13px' }}>
                      {ganador.dinamica || 'Dinámica'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: '#64748b', fontSize: '10px', display: 'block', fontWeight: 700 }}>
                      📦 ESTADO
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
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

                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

                  <button
                    type="button"
                    onClick={() => setMostrarModalGanador(true)}
                    style={{
                      background: '#d97706',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '7px 12px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    🏆 Ver anuncio grande
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
                      ✓ Marcar como Entregado
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
                  padding: esMovil ? '12px' : '16px',
                  textAlign: 'center',
                  color: '#64748b'
                }}
              >
                <span style={{ fontSize: '24px', display: 'block', marginBottom: 4 }}>🎯</span>
                <strong style={{ color: '#334155', fontSize: '13px' }}>
                  Listo para el sorteo
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
                  Al pulsar <strong>"GIRAR RULETA DE COLORES"</strong>, la ruleta girará y al detenerse se mostrará inmediatamente el ganador en pantalla.
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
                maxHeight: esMovil ? '220px' : '320px'
              }}
            >
              <div
                style={{
                  background: '#f1f5f9',
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #e2e8f0',
                  gap: 8,
                  flexWrap: 'wrap'
                }}
              >
                <span style={{ fontWeight: 700, fontSize: '12px', color: '#1e293b' }}>
                  📋 Números en Ruleta ({tickets.length})
                </span>
                <input
                  type="text"
                  placeholder="🔍 Buscar número/cliente..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    width: esMovil ? '130px' : '170px'
                  }}
                />
              </div>

              <div style={{ overflowY: 'auto', flex: 1 }}>
                {ticketsFiltrados.length === 0 ? (
                  <p style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px', margin: 0 }}>
                    {totalTickets === 0
                      ? 'No hay números registrados para esta dinámica.'
                      : 'No se encontraron números con esa búsqueda.'}
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '6px 8px', width: '38px' }}>Color</th>
                        <th style={{ padding: '6px 8px', width: '50px' }}>N°</th>
                        <th style={{ padding: '6px 8px' }}>Cliente</th>
                        <th style={{ padding: '6px 8px' }}>Celular</th>
                        <th style={{ padding: '6px 8px' }}>Estado</th>
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
                            <td style={{ padding: '6px 8px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  width: '12px',
                                  height: '12px',
                                  borderRadius: '50%',
                                  background: t.color,
                                  verticalAlign: 'middle',
                                  border: '1px solid rgba(0,0,0,0.15)'
                                }}
                              />
                            </td>
                            <td style={{ padding: '6px 8px', fontWeight: 700 }}>
                              #{t.numero != null ? t.numero : t.numeroTexto}
                            </td>
                            <td style={{ padding: '6px 8px' }}>{t.cliente}</td>
                            <td style={{ padding: '6px 8px' }}>{t.celular}</td>
                            <td style={{ padding: '6px 8px' }}>
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

            {/* Historial de ganadores */}
            {historialGanadores.length > 1 && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  padding: '8px 12px'
                }}
              >
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                  📜 Historial de giros:
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

      {/* POP-UP / MODAL CELEBRATORIO CUANDO TERMINA DE GIRAR LA RULETA */}
      {mostrarModalGanador && ganador && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            backdropFilter: 'blur(8px)',
            zIndex: 100000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setMostrarModalGanador(false);
          }}
        >
          <div
            style={{
              background: 'linear-gradient(145deg, #ffffff 0%, #fffbeb 100%)',
              border: '3px solid #f59e0b',
              borderRadius: '20px',
              padding: esMovil ? '20px 16px' : '26px 24px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 25px 60px rgba(245, 158, 11, 0.5)',
              textAlign: 'center',
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            {/* Marca de agua de fondo con el logotipo en el popup de ganador */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'url(/JC.jpeg)',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                backgroundSize: '240px',
                opacity: 0.08,
                pointerEvents: 'none',
                zIndex: 0
              }}
            />

            {/* Botón cerrar esquina */}
            <button
              onClick={() => setMostrarModalGanador(false)}
              style={{
                position: 'absolute',
                top: 12,
                right: 12,
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: 32,
                height: 32,
                fontSize: 16,
                cursor: 'pointer',
                color: '#64748b',
                zIndex: 2
              }}
              title="Cerrar ventana de ganador"
            >
              ✕
            </button>

            {/* Logotipo y Trofeo */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 4, position: 'relative', zIndex: 1 }}>
              <img
                src="/JC.jpeg"
                alt="JC Logo"
                style={{
                  width: esMovil ? '44px' : '52px',
                  height: esMovil ? '44px' : '52px',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '2.5px solid #f59e0b',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
                }}
              />
              <span style={{ fontSize: esMovil ? '46px' : '56px', lineHeight: 1 }}>🏆</span>
            </div>

            <div
              style={{
                fontSize: esMovil ? '12px' : '13px',
                fontWeight: 900,
                color: '#b45309',
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}
            >
              ¡TENEMOS UN NÚMERO GANADOR!
            </div>

            {/* Número en tamaño gigante */}
            <div
              style={{
                fontSize: esMovil ? '36px' : '44px',
                fontWeight: 900,
                color: '#92400e',
                background: '#fef3c7',
                border: '2px dashed #f59e0b',
                borderRadius: '14px',
                padding: '8px 18px',
                margin: '12px auto',
                display: 'inline-block',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)'
              }}
            >
              Boleto #{ganador.numero != null ? ganador.numero : ganador.numeroTexto}
            </div>

            {/* Ficha de datos del cliente ganador */}
            <div
              style={{
                background: '#ffffff',
                border: '1px solid #fde68a',
                borderRadius: '12px',
                padding: '12px 14px',
                textAlign: 'left',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 16
              }}
            >
              <div>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, display: 'block' }}>
                  👤 CLIENTE GANADOR:
                </span>
                <strong style={{ fontSize: esMovil ? '15px' : '16px', color: '#0f172a' }}>
                  {ganador.cliente || '—'}
                </strong>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, display: 'block' }}>
                    📱 CELULAR:
                  </span>
                  <strong style={{ fontSize: '14px', color: '#047857' }}>
                    {ganador.celular || '—'}
                  </strong>
                </div>

                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, display: 'block' }}>
                    🎯 DINÁMICA:
                  </span>
                  <strong style={{ fontSize: '13px', color: '#334155' }}>
                    {ganador.dinamica || 'Dinámica'}
                  </strong>
                </div>
              </div>

              <div>
                <span style={{ fontSize: '10px', color: '#64748b', fontWeight: 800, display: 'block' }}>
                  📦 ESTADO DEL BOLETO:
                </span>
                <span
                  style={{
                    display: 'inline-block',
                    marginTop: 2,
                    padding: '3px 10px',
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

            {/* Acciones principales */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                    borderRadius: '10px',
                    padding: '11px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    boxShadow: '0 4px 12px rgba(22, 163, 74, 0.35)'
                  }}
                >
                  ✓ Marcar premio como Entregado
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setMostrarModalGanador(false);
                  girar();
                }}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  boxShadow: '0 4px 12px rgba(234, 88, 12, 0.3)'
                }}
              >
                🎲 Girar ruleta de nuevo
              </button>

              <button
                type="button"
                onClick={() => setMostrarModalGanador(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '9px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#64748b',
                  cursor: 'pointer'
                }}
              >
                Ver Ruleta y Lista de Participantes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
