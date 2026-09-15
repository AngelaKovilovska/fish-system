import { useNavigate } from 'react-router-dom';

/**
 * „Назад“ што го враќа корисникот на страната од која дошол.
 * Ако нема историја (директно отворен линк), оди на fallback патеката.
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate();
  return () => {
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else navigate(fallback);
  };
}
