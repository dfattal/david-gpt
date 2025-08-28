-- Migration: Confidence Thresholds Table
-- Description: Creates table for managing confidence thresholds in knowledge graph extraction
-- Date: 2025-01-27

-- Create confidence thresholds table
CREATE TABLE IF NOT EXISTS rag_confidence_thresholds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_type TEXT NOT NULL CHECK (extraction_type IN ('entity', 'relation')),
    context TEXT NOT NULL, -- 'global', specific entity type, or relation type
    threshold_value DECIMAL(3,2) NOT NULL CHECK (threshold_value >= 0 AND threshold_value <= 1),
    description TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    
    -- Ensure only one active threshold per extraction_type + context combination
    UNIQUE(extraction_type, context, is_active) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_confidence_thresholds_active ON rag_confidence_thresholds(extraction_type, context, is_active);
CREATE INDEX IF NOT EXISTS idx_confidence_thresholds_created_at ON rag_confidence_thresholds(created_at DESC);

-- Add RLS (Row Level Security)
ALTER TABLE rag_confidence_thresholds ENABLE ROW LEVEL SECURITY;

-- Policy: Admin users can manage all thresholds
CREATE POLICY "Admin users can manage confidence thresholds" ON rag_confidence_thresholds
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM auth.users
            WHERE auth.users.id = auth.uid()
            AND auth.users.email IN ('dfattal@gmail.com')
        )
    );

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_confidence_threshold_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS trigger_update_confidence_threshold_updated_at ON rag_confidence_thresholds;
CREATE TRIGGER trigger_update_confidence_threshold_updated_at
    BEFORE UPDATE ON rag_confidence_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION update_confidence_threshold_updated_at();

-- Function to ensure only one active threshold per context
CREATE OR REPLACE FUNCTION enforce_single_active_threshold()
RETURNS TRIGGER AS $$
BEGIN
    -- If setting a threshold to active, deactivate others with same extraction_type and context
    IF NEW.is_active = true AND (OLD IS NULL OR OLD.is_active = false) THEN
        UPDATE rag_confidence_thresholds 
        SET is_active = false, updated_at = NOW()
        WHERE extraction_type = NEW.extraction_type 
        AND context = NEW.context 
        AND is_active = true 
        AND id != NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for single active threshold enforcement
DROP TRIGGER IF EXISTS trigger_enforce_single_active_threshold ON rag_confidence_thresholds;
CREATE TRIGGER trigger_enforce_single_active_threshold
    BEFORE INSERT OR UPDATE ON rag_confidence_thresholds
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_active_threshold();

-- Insert default global thresholds
INSERT INTO rag_confidence_thresholds (extraction_type, context, threshold_value, description, created_by)
SELECT 
    'entity',
    'global',
    0.7,
    'Default global threshold for entity extraction - balances precision and recall',
    (SELECT id FROM auth.users WHERE email = 'dfattal@gmail.com' LIMIT 1)
WHERE NOT EXISTS (
    SELECT 1 FROM rag_confidence_thresholds 
    WHERE extraction_type = 'entity' AND context = 'global' AND is_active = true
);

INSERT INTO rag_confidence_thresholds (extraction_type, context, threshold_value, description, created_by)
SELECT 
    'relation',
    'global', 
    0.6,
    'Default global threshold for relation extraction - slightly lower to capture more potential relationships',
    (SELECT id FROM auth.users WHERE email = 'dfattal@gmail.com' LIMIT 1)
WHERE NOT EXISTS (
    SELECT 1 FROM rag_confidence_thresholds 
    WHERE extraction_type = 'relation' AND context = 'global' AND is_active = true
);

-- Function to get active threshold for extraction type and context
CREATE OR REPLACE FUNCTION get_active_threshold(
    p_extraction_type TEXT,
    p_context TEXT DEFAULT 'global'
)
RETURNS DECIMAL AS $$
DECLARE
    threshold_value DECIMAL;
BEGIN
    -- First try to get specific context threshold
    SELECT ct.threshold_value INTO threshold_value
    FROM rag_confidence_thresholds ct
    WHERE ct.extraction_type = p_extraction_type 
    AND ct.context = p_context
    AND ct.is_active = true;
    
    -- If no specific context found, fall back to global
    IF threshold_value IS NULL AND p_context != 'global' THEN
        SELECT ct.threshold_value INTO threshold_value
        FROM rag_confidence_thresholds ct
        WHERE ct.extraction_type = p_extraction_type 
        AND ct.context = 'global'
        AND ct.is_active = true;
    END IF;
    
    -- Default fallback values
    IF threshold_value IS NULL THEN
        IF p_extraction_type = 'entity' THEN
            threshold_value := 0.7;
        ELSE
            threshold_value := 0.6;
        END IF;
    END IF;
    
    RETURN threshold_value;
END;
$$ LANGUAGE plpgsql;

-- Function to apply confidence thresholds to existing data
CREATE OR REPLACE FUNCTION apply_confidence_thresholds()
RETURNS TABLE(
    entities_updated INTEGER,
    relations_updated INTEGER
) AS $$
DECLARE
    entity_count INTEGER := 0;
    relation_count INTEGER := 0;
    threshold_rec RECORD;
BEGIN
    -- Apply entity thresholds
    FOR threshold_rec IN 
        SELECT extraction_type, context, threshold_value 
        FROM rag_confidence_thresholds 
        WHERE extraction_type = 'entity' AND is_active = true
    LOOP
        IF threshold_rec.context = 'global' THEN
            -- Apply global entity threshold
            UPDATE rag_entities 
            SET status = CASE 
                WHEN confidence >= threshold_rec.threshold_value THEN 'active'
                ELSE 'rejected'
            END,
            updated_at = NOW()
            WHERE status IN ('active', 'rejected');
            
            GET DIAGNOSTICS entity_count = ROW_COUNT;
        ELSE
            -- Apply context-specific entity threshold
            UPDATE rag_entities 
            SET status = CASE 
                WHEN confidence >= threshold_rec.threshold_value THEN 'active'
                ELSE 'rejected'
            END,
            updated_at = NOW()
            WHERE type = threshold_rec.context 
            AND status IN ('active', 'rejected');
            
            GET DIAGNOSTICS entity_count = entity_count + ROW_COUNT;
        END IF;
    END LOOP;
    
    -- Apply relation thresholds
    FOR threshold_rec IN 
        SELECT extraction_type, context, threshold_value 
        FROM rag_confidence_thresholds 
        WHERE extraction_type = 'relation' AND is_active = true
    LOOP
        IF threshold_rec.context = 'global' THEN
            -- Apply global relation threshold
            UPDATE rag_relations 
            SET status = CASE 
                WHEN confidence >= threshold_rec.threshold_value THEN 'approved'
                ELSE 'rejected'
            END,
            updated_at = NOW()
            WHERE status IN ('approved', 'rejected', 'pending');
            
            GET DIAGNOSTICS relation_count = ROW_COUNT;
        ELSE
            -- Apply context-specific relation threshold
            UPDATE rag_relations 
            SET status = CASE 
                WHEN confidence >= threshold_rec.threshold_value THEN 'approved'
                ELSE 'rejected'
            END,
            updated_at = NOW()
            WHERE relation_type = threshold_rec.context 
            AND status IN ('approved', 'rejected', 'pending');
            
            GET DIAGNOSTICS relation_count = relation_count + ROW_COUNT;
        END IF;
    END LOOP;
    
    RETURN QUERY SELECT entity_count, relation_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE rag_confidence_thresholds IS 'Manages confidence thresholds for entity and relation extraction quality control';
COMMENT ON COLUMN rag_confidence_thresholds.extraction_type IS 'Type of extraction: entity or relation';
COMMENT ON COLUMN rag_confidence_thresholds.context IS 'Threshold context: global, specific entity type, or relation type';
COMMENT ON COLUMN rag_confidence_thresholds.threshold_value IS 'Minimum confidence score (0-1) for acceptance';
COMMENT ON FUNCTION get_active_threshold(TEXT, TEXT) IS 'Get active confidence threshold with context fallback to global';
COMMENT ON FUNCTION apply_confidence_thresholds() IS 'Apply all active confidence thresholds to existing entities and relations';