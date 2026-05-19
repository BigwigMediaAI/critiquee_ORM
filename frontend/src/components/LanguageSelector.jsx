import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { Languages, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();

  // Apply RTL direction for Arabic
  useEffect(() => {
    const lang = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language);
    document.documentElement.dir = lang?.rtl ? 'rtl' : 'ltr';
    document.documentElement.lang = i18n.language || 'en';
  }, [i18n.language]);

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  const handleSelect = (code) => {
    i18n.changeLanguage(code);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="language-selector-trigger"
          className="flex items-center gap-1.5 px-2.5 h-8 rounded-lg text-xs font-medium border border-border hover:border-primary/40 hover:bg-muted transition-all"
          title={t('common.language')}
        >
          <Languages size={13} className="text-primary" />
          <span className="uppercase tracking-wide">{current.code}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[200px]">
        <div className="px-2 py-1.5 text-xs text-muted-foreground font-medium">{t('common.language')}</div>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleSelect(lang.code)}
            className={`gap-2 cursor-pointer ${i18n.language === lang.code ? 'font-semibold text-primary' : ''}`}
            data-testid={`language-option-${lang.code}`}
          >
            <span className="text-xs uppercase w-7 text-muted-foreground">{lang.code}</span>
            <span className="flex-1">{lang.native}</span>
            {i18n.language === lang.code && <Check size={13} className="text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
