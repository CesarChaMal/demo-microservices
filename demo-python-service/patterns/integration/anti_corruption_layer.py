"""
Anti-Corruption Layer Pattern Implementation
Translates between different domain models
"""

from typing import Dict, Any, Optional
import logging
import time

logger = logging.getLogger(__name__)

class AntiCorruptionLayerService:
    """Translates between external and internal domain models"""
    
    def __init__(self):
        self.metrics = {
            'translations': 0,
            'errors': 0
        }
    
    def translate_external_to_internal(self, external_data: Dict[str, Any]) -> Dict[str, Any]:
        """Translate external format to internal domain model"""
        try:
            self.metrics['translations'] += 1
            
            # Example translation logic
            internal_data = {
                'id': external_data.get('external_id'),
                'name': external_data.get('external_name'),
                'value': external_data.get('external_value', 0),
                'status': self._map_status(external_data.get('external_status')),
                'metadata': {
                    'source': 'external_system',
                    'translated_at': time.time()
                }
            }
            
            logger.info(f"Translated external data for ID: {internal_data['id']}")
            return internal_data
            
        except Exception as e:
            self.metrics['errors'] += 1
            logger.error(f"Translation error: {e}")
            raise
    
    def translate_internal_to_external(self, internal_data: Dict[str, Any]) -> Dict[str, Any]:
        """Translate internal domain model to external format"""
        try:
            self.metrics['translations'] += 1
            
            external_data = {
                'external_id': internal_data.get('id'),
                'external_name': internal_data.get('name'),
                'external_value': internal_data.get('value', 0),
                'external_status': self._reverse_map_status(internal_data.get('status'))
            }
            
            logger.info(f"Translated internal data for ID: {external_data['external_id']}")
            return external_data
            
        except Exception as e:
            self.metrics['errors'] += 1
            logger.error(f"Translation error: {e}")
            raise
    
    def _map_status(self, external_status: str) -> str:
        """Map external status to internal status"""
        status_mapping = {
            'EXT_ACTIVE': 'ACTIVE',
            'EXT_INACTIVE': 'INACTIVE',
            'EXT_PENDING': 'PENDING'
        }
        return status_mapping.get(external_status, 'UNKNOWN')
    
    def _reverse_map_status(self, internal_status: str) -> str:
        """Map internal status to external status"""
        reverse_mapping = {
            'ACTIVE': 'EXT_ACTIVE',
            'INACTIVE': 'EXT_INACTIVE',
            'PENDING': 'EXT_PENDING'
        }
        return reverse_mapping.get(internal_status, 'EXT_UNKNOWN')
    
    def get_stats(self) -> Dict[str, Any]:
        """Get translation statistics"""
        return {
            'total_translations': self.metrics['translations'],
            'translation_errors': self.metrics['errors'],
            'error_rate': (self.metrics['errors'] / self.metrics['translations'] * 100) if self.metrics['translations'] > 0 else 0
        }

# Global instance
anti_corruption_layer = AntiCorruptionLayerService()