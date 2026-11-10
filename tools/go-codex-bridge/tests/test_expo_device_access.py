import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import expo_device_access as access

class DeviceAccessTests(unittest.TestCase):
    def test_missing_peer_never_asserts_permission(self):
        with patch.object(access.subprocess,'run') as run:
            self.assertFalse(access.check('100.64.0.1',None,'node.exe')['allowed'])
            run.assert_not_called()
    def test_rule_is_read_only_and_parameters_are_not_interpolated_into_commands(self):
        with patch.object(access.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=json.dumps({'allowed':True}))) as run:
            self.assertTrue(access.check('100.64.0.1','100.64.0.2','C:/Program Files/nodejs/node.exe')['allowed'])
            self.assertEqual(run.call_args.kwargs['env']['GO_EXPO_PEER'],'100.64.0.2')
            self.assertNotIn('.Add(',access.SCRIPT);self.assertNotIn('.Remove(',access.SCRIPT)
            self.assertIn("$r.LocalPorts -eq '8089'",access.SCRIPT)
            self.assertIn('$r.Profiles -eq 2',access.SCRIPT)
    def test_unknown_denied_or_timed_out_probe_does_not_mean_remote_access(self):
        for output in ({'allowed':False},{'allowed':'yes'}):
            with patch.object(access.subprocess,'run',return_value=SimpleNamespace(returncode=0,stdout=json.dumps(output))):
                self.assertFalse(access.check('100.64.0.1','100.64.0.2','node.exe')['allowed'])
        with patch.object(access.subprocess,'run',side_effect=access.subprocess.TimeoutExpired('read',8)):
            self.assertFalse(access.check('100.64.0.1','100.64.0.2','node.exe')['allowed'])
