import { MapPin, Lock, Search } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNavigation } from "@/components/BottomNavigation";
import { JogaPage } from "@/components/joga";

const mockFields = [
  { id: "1", name: "Parque das Nações – Campo A", city: "Lisboa", type: "fut7", covered: false, price: "80€/h" },
  { id: "2", name: "Pavilhão Municipal de Benfica", city: "Lisboa", type: "futsal", covered: true, price: "60€/h" },
  { id: "3", name: "Campo de Olaias", city: "Lisboa", type: "futebol11", covered: false, price: "120€/h" },
  { id: "4", name: "Boavista – Campo 2", city: "Porto", type: "fut7", covered: false, price: "75€/h" },
];

export default function Campos() {
  return (
    <JogaPage theme="dark" padded={false}>
      <AppHeader title="Campos" />

      <div className="px-4 space-y-5 pt-4">
        {/* Coming Soon Banner */}
        <div className="relative joga-hero-arena rounded-3xl overflow-hidden px-6 py-8 text-center border border-white/10">
          <div className="absolute inset-0 pitch-texture" />
          <div className="relative">
            <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4">
              <Lock className="w-7 h-7 text-white" />
            </div>
            <h2 className="font-display font-black text-white text-xl mb-2">Em Breve</h2>
            <p className="text-white/70 text-sm leading-relaxed max-w-xs mx-auto">
              O diretório de campos está a ser preparado. Em breve podes pesquisar, filtrar e reservar campos perto de ti.
            </p>
            <div className="mt-5 inline-block px-5 py-2.5 bg-white/20 rounded-xl border border-white/30">
              <span className="text-white font-display font-semibold text-sm">Disponível em breve</span>
            </div>
          </div>
        </div>

        {/* Disabled Search */}
        <div className="relative opacity-50">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            disabled
            type="search"
            placeholder="Pesquisar campos..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm cursor-not-allowed"
          />
        </div>

        {/* Preview Cards */}
        <div>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Pré-visualização</p>
          <div className="space-y-3">
            {mockFields.map((field) => (
              <div key={field.id} className="relative joga-card-arena rounded-2xl overflow-hidden border" data-testid={`field-card-${field.id}`}>
                <div className="absolute inset-0 bg-black/50 z-10 flex items-center justify-center">
                  <div className="bg-gray-800/80 px-3 py-1.5 rounded-full flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-white" />
                    <span className="text-white text-xs font-semibold">Em breve</span>
                  </div>
                </div>
                <div className="px-4 py-4 opacity-60">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display font-bold text-white text-sm">{field.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1 text-white/45 text-xs">
                          <MapPin className="w-3 h-3" />
                          <span>{field.city}</span>
                        </div>
                        <span className="bg-white/10 text-white/70 text-xs px-2 py-0.5 rounded-full">{field.type}</span>
                        {field.covered && <span className="bg-blue-500/15 text-blue-300 text-xs px-2 py-0.5 rounded-full">Coberto</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-white text-sm">{field.price}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </JogaPage>
  );
}
