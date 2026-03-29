import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { COLORS } from '../theme';

type LogoBannerProps = {
  uri: string | null | undefined;
  /** Texto quando não há imagem */
  emptyTitle?: string;
  emptyHint?: string;
  height?: number;
};

/** Área destacada para o logo do estúdio (imagem ou placeholder). */
export function StudioLogoBanner({
  uri,
  emptyTitle = 'Logo do estúdio',
  emptyHint = 'Com API e armazenamento, o proprietário envia o logotipo aqui.',
  height = 120,
}: LogoBannerProps) {
  if (uri) {
    return (
      <View style={[styles.logoImageWrap, { height }]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFillObject} contentFit="contain" />
      </View>
    );
  }
  return (
    <View style={[styles.logoPlaceholder, { minHeight: height }]}>
      <Text style={styles.logoPhGlyph}>♪</Text>
      <Text style={styles.logoPhTitle}>{emptyTitle}</Text>
      <Text style={styles.logoPhHint}>{emptyHint}</Text>
    </View>
  );
}

type StripProps = {
  uris?: string[] | null;
  /** Largura aproximada da área útil da foto (ribbon) ou altura mínima (grid). */
  thumbSize?: number;
  title?: string;
  /**
   * `ribbon` — carrossel horizontal, cada foto num cartão com respiro.
   * `grid` — grelha 2 colunas, espaçamento generoso entre células.
   */
  variant?: 'ribbon' | 'grid';
};

/** Galeria de fotos da sala (layout espaçado). */
export function RoomPhotosStrip({ uris, thumbSize = 72, title, variant = 'grid' }: StripProps) {
  const list = uris?.filter(Boolean) ?? [];
  if (list.length === 0) return null;

  if (variant === 'ribbon') {
    const innerW = Math.max(88, thumbSize);
    const innerH = Math.round(innerW * 0.78);
    return (
      <View style={styles.stripWrap}>
        {title ? <Text style={styles.stripTitle}>{title}</Text> : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.ribbonScroll}
        >
          {list.map((u, i) => (
            <View key={`${u}-${i}`} style={styles.ribbonTile}>
              <Image
                source={{ uri: u }}
                style={[styles.ribbonImage, { width: innerW, height: innerH }]}
                contentFit="cover"
              />
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  /** Grelha 2 colunas: metade da largura cada + padding horizontal cria o “respiro” entre fotos. */
  return (
    <View style={styles.stripWrap}>
      {title ? <Text style={styles.stripTitle}>{title}</Text> : null}
      <View style={styles.gridRow}>
        {list.map((u, i) => (
          <View key={`${u}-${i}`} style={styles.gridHalf}>
            <View style={styles.gridCell}>
              <Image source={{ uri: u }} style={styles.gridImage} contentFit="cover" />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  logoImageWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  logoPlaceholder: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    backgroundColor: COLORS.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  logoPhGlyph: { fontSize: 36, marginBottom: 6, opacity: 0.5 },
  logoPhTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  logoPhHint: { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 6, lineHeight: 17 },
  stripWrap: { marginTop: 6 },
  stripTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  ribbonScroll: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    paddingVertical: 6,
    paddingRight: 8,
  },
  /** Moldura + sombra leve em cada foto (carrossel). */
  ribbonTile: {
    marginRight: 18,
    padding: 10,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  ribbonImage: {
    borderRadius: 14,
    backgroundColor: COLORS.bgElevated,
  },
  gridRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  gridHalf: {
    width: '50%',
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  gridCell: {
    width: '100%',
    aspectRatio: 1.08,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
});
