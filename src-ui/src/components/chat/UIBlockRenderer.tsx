import type { UIBlock } from '@stallion-ai/contracts/ui-block';

interface UIBlockRendererProps {
  block: UIBlock;
}

export function UIBlockRenderer({ block }: UIBlockRendererProps) {
  if (block.type === 'card') {
    return (
      <section
        className={`ui-block ui-block--card ui-block--tone-${block.tone || 'default'}`}
      >
        {block.title && <h4 className="ui-block__title">{block.title}</h4>}
        <p className="ui-block__body">{block.body}</p>
        {block.fields && block.fields.length > 0 && (
          <dl className="ui-block__fields">
            {block.fields.map((field) => (
              <div key={field.label} className="ui-block__field">
                <dt>{field.label}</dt>
                <dd>{field.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    );
  }

  if (block.type === 'table') {
    return (
      <section className="ui-block ui-block--table">
        {(block.title || block.caption) && (
          <div className="ui-block__header">
            {block.title && <h4 className="ui-block__title">{block.title}</h4>}
            {block.caption && (
              <p className="ui-block__caption">{block.caption}</p>
            )}
          </div>
        )}
        <div className="ui-block__table-wrap">
          <table className="ui-block__table">
            <thead>
              <tr>
                {block.columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={`${block.id || block.title || 'table'}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${rowIndex}-${cellIndex}`}>
                      {cell == null ? '—' : String(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  }

  return null;
}
