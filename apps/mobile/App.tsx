import { calcularPartida, calcularTotales, consolidarLinea, formatearMXN } from '@celmi/core';
import { PROPUESTAS_EPOXEMEX, UTILIDAD_EPOXEMEX } from '@celmi/core/fixtures/epoxemex';
import { radios, temas, TOQUE_MINIMO, type PaletaTema } from '@celmi/ui';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

/**
 * Fase 0: pantalla de muestra de la bandeja de autorización con el sistema de diseño compartido
 * y el mismo motor de cálculo que la web. La app real (Expo Router, sesión, push) llega en la Fase 9.
 */
export default function App() {
  const esquema = useColorScheme();
  const c = esquema === 'dark' ? temas.oscuro : temas.claro;
  const s = useMemo(() => estilos(c), [c]);

  const propuestas = useMemo(
    () =>
      PROPUESTAS_EPOXEMEX.map((p) => {
        const partidas = p.partidas.map((x) =>
          calcularPartida({
            costoUnitario: x.costoUnitario,
            cantidad: x.cantidad,
            utilidadPct: UTILIDAD_EPOXEMEX,
          }),
        );
        return { p, partidas, totales: calcularTotales([consolidarLinea(partidas)]) };
      }),
    [],
  );

  const pendiente = () => Alert.alert('Próximamente', 'Las acciones de autorización llegan en la Fase 9.');

  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.raiz} edges={['top', 'bottom']}>
        <StatusBar style="light" />
        <View style={s.barra}>
          <View style={{ flex: 1 }}>
            <Text style={s.barraTitulo}>Autorizar precios</Text>
            <Text style={s.barraSub}>CELMISOLUTIONS-2026001253</Text>
          </View>
          <View style={s.chipPendiente}>
            <Text style={s.chipPendienteTexto}>Pendiente</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.contenido}>
          <View style={s.tarjeta}>
            <Text style={s.cliente}>EPOXEMEX</Text>
            <Text style={s.suave}>Laptops Dell · Adquisición · 6 propuestas + 1 adicional</Text>
            <Text style={[s.suave, { marginTop: 10 }]}>
              Utilidad {UTILIDAD_EPOXEMEX} % · Datos reales de la corrida
            </Text>
          </View>

          {propuestas.map(({ p, partidas, totales }) => (
            <View key={p.nombre} style={s.tarjeta}>
              <Text style={s.etiqueta}>{p.nombre.toUpperCase()}</Text>
              <Text style={s.titulo}>{p.partidas[0]?.descripcion}</Text>
              <Text style={s.suave}>
                {p.partidas.map((x) => x.sku).join(' + ')} · {p.partidas[0]?.cantidad} pzas ·{' '}
                {p.partidas[0]?.mayorista}
              </Text>
              <View style={s.fila}>
                <Dato
                  c={c}
                  etiqueta="Costo unit."
                  valor={formatearMXN(partidas.reduce((t, x) => t + x.costoUnitarioMXN, 0n))}
                />
                <Dato
                  c={c}
                  etiqueta="Precio unit."
                  valor={formatearMXN(partidas.reduce((t, x) => t + x.precioUnitario, 0n))}
                  acento
                />
                <Dato c={c} etiqueta="Total c/IVA" valor={formatearMXN(totales.total)} />
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={s.acciones}>
          <Pressable
            accessibilityRole="button"
            onPress={pendiente}
            style={[s.boton, s.botonSecundario, { flex: 1 }]}
          >
            <Text style={[s.botonTexto, { color: c.peligro }]}>Rechazar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={pendiente}
            style={[s.boton, s.botonPrimario, { flex: 1.6 }]}
          >
            <Text style={[s.botonTexto, { color: c.sobreAcento }]}>Autorizar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Dato({
  c,
  etiqueta,
  valor,
  acento,
}: {
  c: PaletaTema;
  etiqueta: string;
  valor: string;
  acento?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: c.textoSuave }}>{etiqueta}</Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 14,
          fontWeight: '700',
          color: acento ? c.acentoTexto : c.texto,
          fontVariant: ['tabular-nums'],
        }}
      >
        {valor}
      </Text>
    </View>
  );
}

const estilos = (c: PaletaTema) =>
  StyleSheet.create({
    raiz: { flex: 1, backgroundColor: c.nav },
    barra: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: c.nav,
    },
    barraTitulo: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
    barraSub: { color: c.navTexto, fontSize: 12, marginTop: 2 },
    chipPendiente: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: radios.pill,
      backgroundColor: 'rgba(245,181,68,0.2)',
    },
    chipPendienteTexto: { color: '#FFD27A', fontSize: 12, fontWeight: '700' },
    contenido: { padding: 16, gap: 12, backgroundColor: c.fondo, flexGrow: 1 },
    tarjeta: {
      backgroundColor: c.superficie,
      borderColor: c.borde,
      borderWidth: 1,
      borderRadius: 16,
      padding: 16,
    },
    cliente: { color: c.texto, fontSize: 20, fontWeight: '700' },
    etiqueta: { color: c.acentoTexto, fontSize: 12, fontWeight: '700' },
    titulo: { color: c.texto, fontSize: 15, fontWeight: '700', marginTop: 4 },
    suave: { color: c.textoSuave, fontSize: 13, marginTop: 2 },
    fila: { flexDirection: 'row', gap: 10, marginTop: 14 },
    acciones: {
      flexDirection: 'row',
      gap: 8,
      padding: 12,
      paddingHorizontal: 16,
      backgroundColor: c.superficie,
      borderTopColor: c.borde,
      borderTopWidth: 1,
    },
    boton: {
      minHeight: TOQUE_MINIMO + 8,
      borderRadius: radios.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    botonPrimario: { backgroundColor: c.acento },
    botonSecundario: { backgroundColor: c.superficie, borderColor: c.borde, borderWidth: 1 },
    botonTexto: { fontSize: 15, fontWeight: '700' },
  });
