-- Nouveaux types de mouvements (migration séparée : une valeur d'enum ajoutée
-- ne peut pas être utilisée dans la même transaction)
ALTER TYPE "PointTransactionType" ADD VALUE 'HAPPY_HOUR_BONUS';
ALTER TYPE "PointTransactionType" ADD VALUE 'VISIT_MILESTONE_BONUS';
ALTER TYPE "PointTransactionType" ADD VALUE 'STREAK_BONUS';
ALTER TYPE "PointTransactionType" ADD VALUE 'ANNIVERSARY_BONUS';
