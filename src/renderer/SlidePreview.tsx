import { useLayoutEffect, useRef, useState } from 'react';
import type { SlideElement, SlideModel } from '../types';
import './styles/slide-preview.css';

function PreviewElement({ element, model, layer }: { element: SlideElement; model: SlideModel; layer: number }) {
  const box = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const text = element.text;

  useLayoutEffect(() => {
    const frame = box.current;
    const body = content.current;
    if (!frame || !body) {
      setOverflow(false);
      return;
    }
    const measure = () => setOverflow(
      body.scrollHeight > frame.clientHeight + 1 || body.scrollWidth > frame.clientWidth + 1,
    );
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(body);
    document.fonts.addEventListener('loadingdone', measure);
    measure();
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', measure);
    };
  }, [text, model.width, model.height]);

  return <div ref={box} className="slide-preview-element"
    data-overflow={overflow ? 'true' : undefined}
    data-unsupported={element.unsupported ? 'true' : undefined}
    data-role={element.role}
    style={{
      left: `${element.x / model.width * 100}%`, top: `${element.y / model.height * 100}%`,
      width: `${element.width / model.width * 100}%`, height: `${element.height / model.height * 100}%`,
      opacity: element.opacity, backgroundColor: element.fill, zIndex: layer,
      justifyContent: text?.verticalAlign === 'bottom' ? 'flex-end' : text?.verticalAlign === 'middle' ? 'center' : 'flex-start',
    }}>
    {element.image?.startsWith('data:image/') && <img className="slide-preview-image" src={element.image} alt="" />}
    {text && <div ref={content} className="slide-preview-text" style={{
      fontFamily: text.fontFamily, fontSize: `${text.fontSize / model.width * 100}cqw`,
      color: text.color, fontWeight: text.bold ? 700 : 400, fontStyle: text.italic ? 'italic' : 'normal',
      textAlign: text.align,
    }}>{text.content}</div>}
  </div>;
}

/** Approximation of a static slide; unsupported effects remain visibly marked. */
export function SlidePreview({ model, className }: { model: SlideModel; className?: string }) {
  return <div className={`slide-preview${className ? ` ${className}` : ''}`} data-slide-preview
    style={{ aspectRatio: `${model.width} / ${model.height}`, backgroundColor: model.background }}>
    {/* ProPresenter guarda los elementos de delante hacia atrás: el primero va encima. */}
    {model.elements.map((element, index) => <PreviewElement key={index} element={element} model={model} layer={model.elements.length - index} />)}
  </div>;
}
