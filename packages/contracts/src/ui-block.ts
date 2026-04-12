export interface UIBlockBase {
  id?: string;
  title?: string;
  type: string;
}

export interface UICardBlockField {
  label: string;
  value: string;
}

export interface UICardBlock extends UIBlockBase {
  type: 'card';
  body: string;
  fields?: UICardBlockField[];
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

export interface UITableBlock extends UIBlockBase {
  type: 'table';
  caption?: string;
  columns: string[];
  rows: Array<Array<string | number | boolean | null>>;
}

export type UIBlock = UICardBlock | UITableBlock;
