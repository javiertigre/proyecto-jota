import { useEffect, useMemo, useRef, useState } from 'react';

const TEXTO_MARCA = '"Jota Capri"';

export default function SplashBienvenida({ onDone }) {
  const [saliendo, setSaliendo] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Solo desaparece cuando el usuario hace clic en el botón "Ingresar al Sistema"
  useEffect(() => {
    if (!saliendo) return undefined;
    const t = setTimeout(() => onDoneRef.current(), 600);
    return () => clearTimeout(t);
  }, [saliendo]);

  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, []);

  const letras = useMemo(() => [...TEXTO_MARCA], []);
  const brillos = useMemo(
    () => Array.from({ length: 22 }, (_, i) => ({
      left: `${(i * 29) % 100}%`,
      top: `${(i * 43) % 100}%`,
      delay: `${(i % 8) * 0.4}s`,
      duracion: `${2.8 + (i % 4)}s`,
      size: `${3 + (i % 3) * 2}px`
    })),
    []
  );

  const ingresar = (e) => {
    if (e) e.stopPropagation();
    setSaliendo(true);
  };

  return (
    <div
      className={'splash' + (saliendo ? ' saliendo' : '')}
      role="dialog"
      aria-label='Bienvenido al Sistema de su tienda Virtual "Jota Capri"'
    >
      {/* Fondo con la cara de tigre (imagen de inicio) */}
      <div className="splash-fondo-tigre" aria-hidden="true">
        <img src="/Tigres/Tigre6.jpeg" alt="" />
        <div className="splash-fondo-overlay" />
      </div>

      <div className="splash-brillos" aria-hidden="true">
        {brillos.map((b, i) => (
          <span
            key={i}
            style={{
              left: b.left,
              top: b.top,
              width: b.size,
              height: b.size,
              animationDelay: b.delay,
              animationDuration: b.duracion
            }}
          />
        ))}
      </div>

      <div className="splash-logo-entrada">
        <div className="splash-logo-halo" />
        <div className="splash-logo">
          <img src="/JC.jpeg" alt='JC - Tienda Virtual "Jota Capri"' />
        </div>
      </div>

      <div className="splash-texto-wrap">
        <h2 className="splash-bienvenido">
          Bienvenido al Sistema
        </h2>

        <p className="splash-sub">
          de su tienda Virtual
        </p>

        <h1 className="splash-marca" aria-label={TEXTO_MARCA}>
          {letras.map((letra, i) => (
            letra === ' ' ? (
              <span key={i} className="splash-espacio" aria-hidden="true" />
            ) : (
              <span
                key={i}
                style={{
                  '--i': i,
                  animationDelay: `${i * 0.08}s, ${i * 0.12}s`
                }}
              >
                {letra}
              </span>
            )
          ))}
        </h1>
      </div>

      <div className="splash-boton-wrap">
        <button
          type="button"
          className="splash-continuar"
          onClick={ingresar}
        >
          Ingresar al Sistema
        </button>
      </div>
    </div>
  );
}
