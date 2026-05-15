import { CategoryDrilldown } from '@/components/categories/CategoryDrilldown';

interface Props {
  params: { name: string };
}

export default function CategoryDetailPage({ params }: Props) {
  const category = decodeURIComponent(params.name);
  return <CategoryDrilldown category={category} />;
}
