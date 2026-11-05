import { useReducedMotion } from 'framer-motion';
import * as E from './ambience-ui';
export const effects = [
  'None',
  'Dot garden',
  'Interactive dots',
  'Meteor trails',
  'Shooting stars',
  'Sparkles',
  'Warp',
  'Glyph rain',
  'Living shape',
  'Evil eye',
  'Nimbu mirchi',
  'Cursor halo',
];
export function Ambience({ effect, intensity = 35 }: { effect: string; intensity?: number }) {
  const reduced = useReducedMotion();
  if (reduced || effect === 'None')
    return (
      <div className="hub-ambient-static" aria-hidden="true">
        ✳
      </div>
    );
  const content = (
    <span className="hub-ambient-word" aria-hidden="true">
      make room.
    </span>
  );
  return (
    <div className="hub-ambience" aria-hidden="true">
      {effect === 'Dot garden' && (
        <E.DotField gradientFrom="rgba(181,240,200,.4)" gradientTo="rgba(198,182,241,.3)">
          {content}
        </E.DotField>
      )}
      {effect === 'Interactive dots' && (
        <E.DotShader className="h-full" speed={intensity / 70} accentColor="#b5f0c8">
          {content}
        </E.DotShader>
      )}
      {effect === 'Meteor trails' && <E.Meteors number={Math.round(intensity / 5) + 2}>{content}</E.Meteors>}
      {effect === 'Shooting stars' && (
        <E.ShootingStars
          className="h-full"
          starCount={Math.round(intensity) + 10}
          showEmbers={false}
          nebula={false}
        >
          {content}
        </E.ShootingStars>
      )}
      {effect === 'Sparkles' && (
        <E.SparklesCore className="h-full" particleCount={Math.round(intensity) + 5} particleColor="#b5f0c8">
          {content}
        </E.SparklesCore>
      )}
      {effect === 'Warp' && (
        <E.SpeedWarp className="h-full" starCount={Math.round(intensity * 2) + 10} speed={intensity / 5}>
          {content}
        </E.SpeedWarp>
      )}
      {effect === 'Glyph rain' && (
        <E.GlyphMatrix className="h-full" color="#b5f0c8" speed={intensity / 50} opacity={0.5}>
          {content}
        </E.GlyphMatrix>
      )}
      {effect === 'Living shape' && (
        <E.MorphingBlob width={260} height={220} speed={intensity / 50} colors={['#b5f0c8', '#c7b6f0']} />
      )}
      {effect === 'Evil eye' && <E.EvilEye className="h-full" caption="Decorative evil-eye charm" />}
      {effect === 'Nimbu mirchi' && (
        <E.NimbuMirchi className="h-full" caption="Decorative nimbu-mirchi charm" />
      )}
      {effect === 'Cursor halo' && (
        <>
          <E.DotField className="h-full">{content}</E.DotField>
          <E.CursorFollower size={22} className="bg-[#b5f0c8]/40 rounded-full" />
        </>
      )}
    </div>
  );
}
