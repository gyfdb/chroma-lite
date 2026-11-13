import type { JSX } from 'solid-js';

/** Shared prop types for every Aalto component (both editions). */
export type Child = JSX.Element;
/** An icon is a Material Symbols ligature name ("pets") or any element. */
export type IconLike = string | JSX.Element;

interface Base { class?: string; style?: JSX.CSSProperties }

export type ButtonVariant = 'filled' | 'tonal' | 'outlined' | 'text' | 'elevated' | 'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive';
export type Size = 'xs' | 's' | 'm' | 'l' | 'xl';

export interface ButtonProps extends Base, Omit<JSX.ButtonHTMLAttributes<HTMLButtonElement>, 'class' | 'style'> {
  variant?: ButtonVariant; size?: Size; shape?: 'default' | 'round' | 'square';
  icon?: IconLike; trailingIcon?: IconLike;
  toggle?: boolean; selected?: boolean; defaultSelected?: boolean; onSelectedChange?: (v: boolean) => void;
  children?: Child;
}
export interface ButtonGroupProps extends Base { variant?: 'standard' | 'connected'; label?: string; children: Child }
export interface IconButtonProps extends Base {
  icon: string; label: string; variant?: 'standard' | 'filled' | 'tonal' | 'outlined'; size?: Size; width?: 'narrow' | 'wide'; shape?: 'default' | 'round' | 'square';
  toggle?: boolean; selected?: boolean; defaultSelected?: boolean; selectedIcon?: string; onSelectedChange?: (v: boolean) => void;
  onClick?: (e: MouseEvent) => void; disabled?: boolean;
}
export type FabColor = 'primary-container' | 'secondary-container' | 'tertiary-container' | 'primary' | 'secondary' | 'tertiary' | 'surface';
export interface FABProps extends Base { icon: IconLike; label: string; size?: 's' | 'm' | 'l'; color?: FabColor; onClick?: (e: MouseEvent) => void; 'aria-expanded'?: boolean }
export interface ExtendedFABProps extends Base { icon?: IconLike; label: string; size?: 's' | 'm' | 'l'; color?: FabColor; onClick?: (e: MouseEvent) => void }
export interface FABMenuItem { icon: IconLike; label: string; onClick?: () => void }
export interface FABMenuProps extends Base {
  icon?: string; label?: string; color?: 'primary' | 'secondary' | 'tertiary'; size?: 's' | 'm' | 'l'; items: FABMenuItem[];
  open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void;
}
export interface SegmentOption { value: string; label?: string; icon?: string; disabled?: boolean }
export interface SegmentedButtonProps extends Base {
  options: SegmentOption[]; multiSelect?: boolean; label?: string;
  value?: string | string[] | null; defaultValue?: string | string[] | null; onChange?: (v: any) => void;
}
export interface MenuItem { label: string; icon?: IconLike; shortcut?: string; trailingIcon?: IconLike; selected?: boolean; disabled?: boolean; onClick?: () => void }
export type MenuEntry = MenuItem | { divider: true };
export interface SplitButtonProps extends Base {
  label: string; icon?: IconLike; variant?: ButtonVariant; size?: Size; items?: MenuEntry[]; onClick?: (e: MouseEvent) => void;
  open?: boolean; defaultOpen?: boolean; onOpenChange?: (o: boolean) => void; menuLabel?: string; disabled?: boolean;
}

export interface BadgeProps extends Base { count?: number; max?: number; label?: string; children?: Child }
export interface LoadingIndicatorProps extends Base { contained?: boolean; size?: number; label?: string }
export interface ProgressIndicatorProps extends Base { type?: 'linear' | 'circular'; value?: number | null; wavy?: boolean; label?: string }
export interface SnackbarProps extends Base { message: Child; action?: string; onAction?: () => void; onClose?: () => void; multiline?: boolean }
export interface TooltipProps extends Base { text: Child; title?: string; action?: string; onAction?: () => void; variant?: 'plain' | 'rich'; open?: boolean; children: Child }

export interface CardProps extends Base { variant?: 'default' | 'elevated' | 'filled' | 'outlined'; onClick?: (e: MouseEvent) => void; children: Child }
export interface CarouselItem { label: string; src?: string; color?: string; textColor?: string }
export interface CarouselProps extends Base { items: CarouselItem[]; layout?: 'multi-browse' | 'hero' | 'uncontained'; height?: number }
export interface OverlayProps { open?: boolean; modal?: boolean; inline?: boolean; onClose?: () => void }
export interface DialogProps extends Base, OverlayProps {
  icon?: IconLike; headline?: string; actions?: Child; fullscreen?: boolean; confirm?: string; onConfirm?: () => void; children?: Child;
}
export interface DividerProps extends Base { inset?: boolean; middle?: boolean; vertical?: boolean }
export interface ListProps extends Base { children: Child }
export interface ListItemProps {
  headline: Child; supporting?: Child; overline?: string; leading?: IconLike; trailing?: IconLike;
  lines?: 1 | 2 | 3; selected?: boolean; disabled?: boolean; onClick?: (e: MouseEvent) => void;
}
export interface BottomSheetProps extends Base, OverlayProps { handle?: boolean; label?: string; children: Child }
export interface SideSheetProps extends Base, OverlayProps { headline: string; onBack?: () => void; actions?: Child; children?: Child }

export interface AppBarAction { icon: string; label: string; onClick?: () => void }
export interface TopAppBarProps extends Base {
  title: Child; subtitle?: string; variant?: 'small' | 'center' | 'medium' | 'large';
  navIcon?: string | null; navLabel?: string; onNav?: () => void; actions?: (AppBarAction | JSX.Element)[]; scrolled?: boolean;
}
export interface BottomAppBarProps extends Base { actions?: AppBarAction[]; fab?: Omit<FABProps, 'icon'> & { icon: string } }
export interface NavItem { value: string; label: string; icon: string; badge?: number | true }
export interface NavigationBarProps extends Base { items: NavItem[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; label?: string }
export interface NavigationRailProps extends Base {
  items: NavItem[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; label?: string;
  fab?: { icon: string; label: string; onClick?: () => void }; expanded?: boolean; defaultExpanded?: boolean; onExpandedChange?: (v: boolean) => void;
}
export interface DrawerItem { value: string; label: string; icon?: string; badge?: Child }
export interface NavigationDrawerProps extends Base {
  items?: DrawerItem[]; sections?: { headline?: string; items: DrawerItem[] }[]; headline?: string;
  value?: string; defaultValue?: string; onChange?: (v: string) => void; label?: string;
  modal?: boolean; open?: boolean; inline?: boolean; onClose?: () => void;
}
export interface TabItem { value: string; label: string; icon?: string; badge?: number | true }
export interface TabsProps extends Base { items: TabItem[]; variant?: 'primary' | 'secondary'; value?: string; defaultValue?: string; onChange?: (v: string) => void }
export interface ToolbarProps extends Base {
  variant?: 'docked' | 'floating'; color?: 'standard' | 'vibrant'; vertical?: boolean; items?: IconButtonProps[];
  fab?: { icon: string; label: string; onClick?: () => void }; label?: string; children?: Child;
}
export interface SearchProps extends Base {
  placeholder?: string; value?: string; defaultValue?: string; onChange?: (v: string) => void;
  leadingIcon?: string; trailingIcon?: string; trailingLabel?: string; shortcut?: string; avatar?: Child;
  results?: ListItemProps[]; onBack?: () => void;
}

export interface CheckboxProps extends Base {
  checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void; indeterminate?: boolean; error?: boolean; disabled?: boolean;
  label?: Child; 'aria-label'?: string;
}
export interface RadioButtonProps extends Base { checked?: boolean; name?: string; value?: string; onChange?: (value: string | undefined) => void; disabled?: boolean; label?: Child; 'aria-label'?: string }
export interface SwitchProps extends Base { checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void; icons?: boolean; disabled?: boolean; label?: Child; 'aria-label'?: string }
export interface ChipProps extends Base {
  variant?: 'assist' | 'filter' | 'input' | 'suggestion'; label: string; icon?: string; avatar?: Child;
  selected?: boolean; defaultSelected?: boolean; onSelectedChange?: (v: boolean) => void; elevated?: boolean; dropdown?: boolean;
  onRemove?: () => void; onClick?: (e: MouseEvent) => void; disabled?: boolean;
}
export interface MenuProps extends Base { items: MenuEntry[]; open?: boolean; onSelect?: (item: MenuItem) => void }
export interface SliderProps extends Base {
  value?: number; defaultValue?: number; onChange?: (v: number) => void; min?: number; max?: number; step?: number;
  discrete?: boolean; showValue?: boolean; format?: (v: number) => string; disabled?: boolean; label: string;
}
export interface TextFieldProps extends Base {
  variant?: 'filled' | 'outlined'; label?: string; value?: string; defaultValue?: string; onChange?: (v: string) => void;
  placeholder?: string; supporting?: string; error?: boolean; required?: boolean; disabled?: boolean;
  leadingIcon?: IconLike; trailingIcon?: IconLike; prefix?: string; suffix?: string; multiline?: boolean; rows?: number; maxLength?: number; type?: string;
}
export interface DatePickerProps extends Base {
  value?: Date; defaultValue?: Date; onChange?: (d: Date) => void; variant?: 'modal' | 'docked'; headline?: string; today?: Date;
  onCancel?: () => void; onConfirm?: (d: Date) => void;
}
export interface Time { hour: number; minute: number }
export interface TimePickerProps extends Base {
  value?: Time; defaultValue?: Time; onChange?: (t: Time) => void;
  variant?: 'dial' | 'input'; defaultVariant?: 'dial' | 'input'; onVariantChange?: (v: 'dial' | 'input') => void;
  headline?: string; onToggleMode?: () => void; onCancel?: () => void; onConfirm?: (t: Time) => void;
}

export interface IconProps { name: string; filled?: boolean; size?: number; class?: string }
export interface AvatarProps { src?: string; alt?: string; color?: string; children?: Child; class?: string }

/* Cloudflare (Kumo) edition extras */
export interface PillProps extends Base { variant?: 'neutral' | 'dashed' | 'brand' | 'teal' | 'gold' | 'success' | 'danger' | 'solid' | 'inverted'; icon?: IconLike; dot?: boolean; children: Child }
export interface BannerProps extends Base { variant?: 'info' | 'warning' | 'danger' | 'success' | 'brand'; title?: string; icon?: string; action?: Child; onClose?: () => void; children?: Child }
export interface TableColumn<R = any> { key: string; label: string; numeric?: boolean; width?: number | string; render?: (row: R) => JSX.Element }
export interface TableProps<R = any> extends Base {
  columns: TableColumn<R>[]; rows: R[]; selectable?: boolean; rowKey?: (row: R, index: number) => string | number;
  selected?: (string | number)[]; defaultSelected?: (string | number)[]; onSelectedChange?: (keys: (string | number)[]) => void;
}
export interface BreadcrumbsProps extends Base { items: { label: string; href?: string }[] }
export interface MeterProps extends Base { label: string; value: number; max?: number; valueLabel?: string; warnAt?: number; icon?: IconLike }
export interface SelectProps extends Base { options: { value: string; label: string }[]; value?: string; defaultValue?: string; onChange?: (v: string) => void; label: string; disabled?: boolean }
