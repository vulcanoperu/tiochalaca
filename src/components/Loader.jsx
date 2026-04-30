export default function Loader({ text = 'Cargando datos...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 animate-fade-in">
      <div className="flex gap-2">
        <span className="loader-dot" />
        <span className="loader-dot" />
        <span className="loader-dot" />
      </div>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
