/**
 * The material index.
 *
 * Four numbered callouts for the four surfaces the camera visits during this
 * chapter. Deliberately DOM text rather than markers pinned to the 3D model:
 * anchored labels need the shoe to be at a known angle, and this chapter's
 * camera swings from the heel counter round to the woven flank. A numbered index
 * stays legible through the whole move, and it is readable by a screen reader
 * and by a search engine, which a projected label is not.
 */

const MATERIALS: readonly { ordinal: string; name: string; note: string }[] = [
  { ordinal: '01', name: 'Engineered mesh', note: 'Woven upper. Matte, open, structural where it needs to be.' },
  { ordinal: '02', name: 'TPU rib cage', note: 'Gloss-injected ribs. The one surface that catches a hard highlight.' },
  { ordinal: '03', name: 'Patent heel counter', note: 'Mirror finish over a moulded counter. Locks the heel, catches the light.' },
  { ordinal: '04', name: 'PU column array', note: 'Twenty-two polyurethane spools between two plates.' },
]

export function DetailIndex() {
  return (
    <ol className="detail-index">
      {MATERIALS.map((material) => (
        <li className="detail-index__item" key={material.ordinal}>
          <span className="detail-index__ordinal type-num type-micro">{material.ordinal}</span>
          <span className="detail-index__body">
            <span className="detail-index__name type-label">{material.name}</span>
            <span className="detail-index__note type-micro">{material.note}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
