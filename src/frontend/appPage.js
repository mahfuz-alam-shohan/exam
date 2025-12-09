import { renderDocument } from './layout';
import { baseStyles } from './styles';
import { appClientScript } from './client';

export function getAppPageHtml() {
  return renderDocument({
    title: 'My Class',
    styles: baseStyles,
    script: appClientScript,
  });
}
